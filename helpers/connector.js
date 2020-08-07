const File = require("./file.js");
const Database = require("better-sqlite3");

class Connector {

	/**
	 * Creates a new Connector for the specified configuration.
	 * @param {String} databasePath Path to the database (.db)
	 * @param {String} credentialsPath Path to the credentials file (.json)
	 * @param {[String]} [disabledEndpoints=[]] Endpoints to disable.
	 * @param {Boolean} readOnly Whether the connector should be read-only.
	 */
	constructor(databasePath, credentialsPath, disabledEndpoints, readOnly) {
		this.db = new Database(databasePath, { readonly: Boolean(readOnly), fileMustExist: true });
		this.credentials = new File(credentialsPath, err => { throw err; }).read();

		this._endpoints = [
			"getBotInfo",
			"getTables",
			"getFields",
			"execSql",
			"getCurrency",
			"setCurrency",
			"addCurrency",
			"subtractCurrency",
			"createTransaction",
			"getTransactions",
			"getGuildRank",
			"getGuildXp",
			"setGuildXp",
			"addGuildXp",
			"subtractGuildXp",
			"awardGuildXp",
			"getGuildXpLeaderboard",
			"getGuildXpRoleRewards",
			"getGuildXpCurrencyRewards",
			"getGlobalRank",
			"getGlobalXp",
			"getGlobalXpLeaderboard",
			"getClubLeaderboard",
			"getClubInfo",
			"getClubInfoByUser",
			"getClubMembers"
		];

		if (readOnly) disabledEndpoints = disabledEndpoints.concat(this._endpoints.filter(endpoint => !endpoint.startsWith("get")));
		this._disabledEndpoints = [...new Set(disabledEndpoints)];
		this._init = false;
	}

	/**
	 * Gets all endpoints implemented in the Connector.
	 * @return {[String]} Array of endpoints.
	 */
	get allEndpoints() {
		return this._endpoints;
	}

	/**
	 * Gets available endpoints for the current Connector instance.
	 * @return {[String]} Array of available endpoints.
	 */
	get endpoints() {
		return this._endpoints.filter(endpoint => !this._disabledEndpoints.includes(endpoint));
	}

	/**
	 * Gets disabled endpoints for the current Connector instance.
	 * @return {[String]} Array of disabled endpoints.
	 */
	get disabledEndpoints() {
		return this._disabledEndpoints;
	}
	/**
	 * Sets disabled endpoints for the current Connector instance.
	 * @param {[String]} disabledEndpoints Array of disabled endpoints.
	 */
	set disabledEndpoints(disabledEndpoints) {
		this._disabledEndpoints = [...new Set(disabledEndpoints)];
	}

	/**
	 * Get the initialization state of the connector.
	 * @returns {Boolean} Whether the connector is initialized or not.
	 */
	get initialized() {
		return this._init;
	}

	/**
	 * Calculate levels gained from a given amount of XP.
	 * @param {Number} xp XP to calculate level for.
	 * @param {Number} baseXp Base XP for calculating other levels.
	 * @returns {Object} Level information.
	 */
	calcLevel(xp, baseXp = 36) {
		if (typeof xp !== "number" || xp < 0)
			throw new Error("XP must be a valid numerical value.");
		if (typeof baseXp !== "number" || baseXp < 0)
			throw new Error("Base XP must be a valid numerical value.");

		let requiredXp = baseXp, totalXp = 0, lvl = 1;
		while (true) {
			requiredXp = parseInt((baseXp + baseXp / 4.0 * (lvl - 1)), 10);
			if (requiredXp + totalXp > xp)
				break;
			totalXp += requiredXp;
			lvl++;
		}

		return { level: lvl - 1, levelXp: xp - totalXp, requiredXp };
	}


	/**
	 * Check if the connector has been initialized or not.
	 */
	checkInitialized() {
		if (!this._init)
			throw new Error("Connector not initialized. Please initialize it by calling initialize().");
	}

	/**
	 * Check if the endpoint has been disabled.
	 */
	checkEndpoint(endpoint) {
		this.checkInitialized();
		if (this._disabledEndpoints.map(endpoint => endpoint.toLowerCase()).includes(endpoint.toLowerCase()))
			throw new Error("Endpoint disabled.");
	}

	/**
	 * Initialize the connector.
	 */
	initialize() {
		try {
			const statements = ["journal_mode=OFF", "locking_mode=NORMAL", "synchronous=OFF", "optimize"];
			statements.forEach(statement => this.db.pragma(statement));
		}
		catch (error) {
			throw new Error("Database could not be initialized.");
		}
		this._init = true;
	}

	/**
	 * Gets info about the bot.
	 * @returns {Object} Info about the bot.
	 */
	getBotInfo() {
		this.checkEndpoint("getBotInfo");
		const bet = this.db.prepare("select MinBet as 'minimum', MaxBet as 'maximum' from BotConfig").get();
		const currency = this.db.prepare("select CurrencySign as 'sign', CurrencyName as 'name', CurrencyPluralName as 'pluralname' from BotConfig").get();
		const generation = this.db.prepare("select CurrencyGenerationChance as 'chance', CurrencyGenerationCooldown as 'cooldown', CurrencyDropAmount as 'minimumDrop', CurrencyDropAmountMax as 'maximumDrop' from BotConfig").get();
		const timely = this.db.prepare("select TimelyCurrency as 'amount', TimelyCurrencyPeriod as 'timeout' from BotConfig").get();
		const xp = this.db.prepare("select XpPerMessage as 'perMessage', XpMinutesTimeout as 'timeout' from BotConfig").get();
		return {
			id: this.credentials.ClientId,
			owners: this.credentials.OwnerIds,
			currency: {
				...currency,
				bet, generation, timely
			},
			xp
		};
	}

	/**
	 * Gets the tables present in the database.
	 * @returns {Object} Array of table names.
	 */
	getTables() {
		this.checkEndpoint("getTables");
		const tables = this.db.prepare("select name from sqlite_master where type='table'").all().map(table => table.name).sort();
		if (!tables) throw new Error("Unable to list tables.");
		this.tables = tables;
		return { tables };
	}

	/**
	 * Gets fields present in the specified table.
	 * @param {String} table Name of the table.
	 * @returns {Object} Array of field names.
	 */
	getFields(table) {
		this.checkEndpoint("getFields");
		if (!this.tables) this.tables = this.getTables().tables;
		if (!this.tables.includes(table)) throw new Error("Table not present.");
		const fields = this.db.prepare(`select * from ${table}`).get();
		return { fields: Object.keys(fields) };
	}

	/**
	 * Execute an SQL query and return the rows.
	 * @param {String} command The SQL command to execute.
	 * @returns {Object} Result of the command, array of rows if multiple rows were affected or a single JSON object if a single row was affected.
	 */
	execSql(command) {
		this.checkEndpoint("execSql");
		const rows = this.db.prepare(command).all();
		return { rows, affected: rows.length };
	}

	/**
	 * Check if a Discord guild exists in the database.
	 * @param {String} guildId ID of the Discord guild.
	 */
	checkIfGuildExists(guildId) {
		if (typeof guildId !== "string") throw new Error("Guild IDs must be provided as strings.");
		const guild = this.db.prepare("select Id from GuildConfigs where GuildId=$guildId").get({ guildId });
		if (!guild) throw new Error("Guild not found.");
	}

	/**
	 * Check if a Discord user exists in the database.
	 * @param {String} userId ID of the Discord user.
	 */
	checkIfUserExists(userId) {
		if (typeof userId !== "string") throw new Error("User IDs must be provided as strings.");
		const user = this.db.prepare("select Id from DiscordUser where UserId=$userId").get({ userId });
		if (!user) throw new Error("User not found.");
	}

	/**
	 * Check if currency amount is properly specified.
	 * @param {String} currency Currency amount.
	 */
	checkIfValidCurrency(currency) {
		if (typeof currency !== "number")
			throw new Error("Currency amount must be a number.");
		if (currency >= Number.MAX_SAFE_INTEGER || currency <= Number.MIN_SAFE_INTEGER)
			throw new Error("Currency amount exceeds maximum safe integer limits.");
	}

	/**
	 * Get the currency of a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @returns {Object} Balance info about the specified user.
	 */
	getCurrency(userId) {
		this.checkEndpoint("getCurrency");
		this.checkIfUserExists(userId);
		const info = this.db.prepare("select cast(UserId as text) as 'userId', CurrencyAmount as 'currency' from DiscordUser where UserId = $userId").get({ userId });
		if (!info) throw new Error("Unable to fetch currency.");
		return info;
	}

	/**
	 * Set the currency of a Discord user. NOT RECOMMENDED! Use addCurrency instead for normal transactions.
	 * @param {String} userId ID of the Discord user.
	 * @param {Number} currency Currency amount to be set.
	 * @returns {Object} Balance info about the specified user.
	 */
	setCurrency(userId, currency) {
		this.checkEndpoint("setCurrency");
		this.checkIfUserExists(userId);
		this.checkIfValidCurrency(currency);
		const { changes } = this.db.prepare("update DiscordUser set CurrencyAmount = $currency where UserId=$userId").run({ currency, userId });
		if (!changes) throw new Error("Unable to update currency.");
		return { userId, currency };
	}

	/**
	 * Add currency to a user.
	 * @param {String} userId ID of the Discord user.
	 * @param {Number} currency Currency amount to be added.
	 * @param {String} reason Reason for the transaction.
	 * @returns {Object} Balance info about the specified user.
	 */
	addCurrency(userId, currency, reason) {
		this.checkEndpoint("addCurrency");
		this.checkIfUserExists(userId);
		this.checkIfValidCurrency(currency);
		const userCurrency = this.db.prepare("update DiscordUser set CurrencyAmount = CurrencyAmount + $currency where UserId = $userId")
			.run({ currency: Math.abs(currency), userId });
		if (!userCurrency.changes) throw new Error("Unable to add currency to this user.");
		const createdTransaction = this.createTransaction(userId, Math.abs(currency), reason);
		if (!createdTransaction) throw new Error("Unable to create a currency transaction for the user.");
		if (userId !== this.credentials.ClientId)
			this.subtractCurrency(this.credentials.ClientId, currency, reason);
		return this.getCurrency(userId);
	}

	/**
	 * Subtract currency from a user.
	 * @param {String} userId ID of the Discord user.
	 * @param {Number} currency Currency amount to be subtracted.
	 * @param {String} reason Reason for the transaction.
	 * @returns {Object} Balance info about the specified user.
	 */
	subtractCurrency(userId, currency, reason) {
		this.checkEndpoint("subtractCurrency");
		this.checkIfUserExists(userId);
		this.checkIfValidCurrency(currency);
		const { currency: oldCurrency } = this.getCurrency(userId);
		if (Math.abs(currency) > oldCurrency && userId !== this.credentials.ClientId)
			throw new Error("User does not have the specified currency.");
		const userCurrency = this.db.prepare("update DiscordUser set CurrencyAmount =  CurrencyAmount - $currency where UserId = $userId")
			.run({ currency: Math.abs(currency), userId });
		if (!userCurrency.changes) throw new Error("Unable to subtract currency from this user.");
		const createdTransaction = this.createTransaction(userId, -1 * Math.abs(currency), reason);
		if (!createdTransaction) throw new Error("Unable to create a currency transaction for the user.");
		if (userId !== this.credentials.ClientId)
			this.addCurrency(this.credentials.ClientId, currency, reason);
		return this.getCurrency(userId);
	}

	/**
	 * Create a transaction for a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {Number} currency Amount added to or subtracted from the user.
	 * @param {String} reason Reason for the transaction.
	 * @returns {Object} Transaction info.
	 */
	createTransaction(userId, currency, reason) {
		this.checkEndpoint("createTransaction");
		this.checkIfValidCurrency(currency);
		const dateAdded = new Date().toISOString().replace(/[TZ]/g, " ");
		const createdTransaction = this.db.prepare("insert into CurrencyTransactions (UserId, Amount, Reason, DateAdded) values ($userId, $currency, $reason, $dateAdded)").run({ userId, currency, reason, dateAdded });
		if (!createdTransaction) throw new Error("Unable to create a transaction.");
		return { userId, transactionId: createdTransaction.lastInsertRowid };
	}

	/**
	 * Get transactions of a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {Number} startPosition Start position/offset of transactions.
	 * @param {Number} items Items per page.
	 * @returns {Object} Transactions.
	 */
	getTransactions(userId, startPosition = 0, items = 10) {
		this.checkEndpoint("getTransactions");
		this.checkIfUserExists(userId);
		const transactions = this.db.prepare("select Id as 'transactionId', Amount as 'amount', Reason as 'reason', DateAdded as 'dateAdded' from CurrencyTransactions where UserId = $userId order by Id desc limit $items offset $startPosition").all({ userId, items, startPosition });
		if (!transactions.length) throw new Error("No transactions found for this user.");
		return transactions;
	}

	/**
	 * Get ranking of a Discord user in a specific guild.
	 * @param {String} userId ID of the Discord user.
	 * @param {String} guildId ID of the Discord guild.
	 * @returns {Object} Rank info.
	 */
	getGuildRank(userId, guildId) {
		this.checkEndpoint("getGuildRank");
		this.checkIfUserExists(userId);
		this.checkIfGuildExists(guildId);
		const guildRankings = this.db.prepare("select cast(UserId as text) as 'id' from UserXpStats where GuildId=$guildId order by Xp+AwardedXp desc").all({ guildId }).map(user => user.id);
		if (!guildRankings.length) throw new Error("Unable to get guild rankings.");
		const rank = guildRankings.indexOf(userId) > -1 ? guildRankings.indexOf(userId) + 1 : guildRankings.length;
		return { userId, rank };
	}

	/**
	 * Get the guild XP of a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {String} guildId ID of the Discord guild.
	 * @returns {Object} Information about the user's XP.
	 */
	getGuildXp(userId, guildId) {
		this.checkEndpoint("getGuildXp");
		this.checkIfUserExists(userId);
		this.checkIfGuildExists(guildId);
		const xpInfo = this.db.prepare("select Xp, AwardedXp from UserXpStats where UserId = $userId and GuildId = $guildId").get({ userId, guildId });
		if (!xpInfo) throw new Error("Unable to get XP info of the given user for this guild.");
		const rankInfo = this.getGuildRank(userId, guildId);
		if (!rankInfo) throw new Error("Unable to get rank.");
		const levelInfo = this.calcLevel(xpInfo.Xp + xpInfo.AwardedXp);
		if (!levelInfo) throw new Error("Unable to calculate level.");
		return {
			guildXp: xpInfo.Xp,
			awardedXp: xpInfo.AwardedXp,
			totalXp: xpInfo.Xp + xpInfo.AwardedXp,
			...levelInfo,
			rank: rankInfo.rank
		};
	}

	/**
	 * Set the guild XP of a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {String} guildId ID of the Discord guild.
	 * @param {String} xp XP of the Discord user.
	 * @param {String} awardedXp XP awarded to the Discord user.
	 * @returns {Object} Information about the user's guild XP.
	 */
	setGuildXp(userId, guildId, xp, awardedXp) {
		this.checkEndpoint("setGuildXp");
		this.checkIfUserExists(userId);
		this.checkIfGuildExists(guildId);
		const guildXp = this.db.prepare("update UserXpStats set Xp=$xp, AwardedXp=$awardedXp where UserId=$userId and GuildId=$guildId").run({ xp, awardedXp, userId, guildId });
		if (!guildXp.changes) throw new Error("Unable to update guild XP.");
		const xpInfo = this.getGuildXp(userId, guildId);
		if (!xpInfo) throw new Error("Unable to fetch XP info.");
		return xpInfo;
	}

	/**
	 * Add guild XP to a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {String} guildId ID of the Discord guild.
	 * @param {String} xp XP to be added.
	 * @returns {Object} Information about the user's guild XP.
	 */
	addGuildXp(userId, guildId, xp) {
		this.checkEndpoint("addGuildXp");
		this.checkIfUserExists(userId);
		this.checkIfGuildExists(guildId);
		const guildXp = this.db.prepare("update UserXpStats set AwardedXp = AwardedXp + $xp where UserId = $userId and GuildId = $guildId")
			.run({ xp: Math.abs(xp), userId, guildId });
		if (!guildXp.changes) throw new Error("Unable to add guild Xp to this user.");
		return this.getGuildXp(userId, guildId);
	}

	/**
	 * Subtract guild XP from a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {String} guildId ID of the Discord guild.
	 * @param {String} xp XP to be subtracted.
	 * @returns {Object} Information about the user's guild XP.
	 */
	subtractGuildXp(userId, guildId, xp) {
		this.checkEndpoint("subtractGuildXp");
		this.checkIfUserExists(userId);
		this.checkIfGuildExists(guildId);
		const guildXp = this.db.prepare("update UserXpStats set AwardedXp = AwardedXp - $xp where UserId = $userId and GuildId = $guildId")
			.run({ xp: Math.abs(xp), userId, guildId });
		if (!guildXp.changes) throw new Error("Unable to subtract guild Xp from this user.");
		return this.getGuildXp(userId, guildId);
	}

	/**
	 * Award guild XP to a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {String} guildId ID of the Discord guild.
	 * @param {String} xp XP to be awarded.
	 * @returns {Object} Information about the user's guild XP.
	 */
	awardGuildXp(userId, guildId, xp) {
		this.checkEndpoint("awardGuildXp");
		return xp > 0 ? this.addGuildXp(userId, guildId, xp) : this.subtractGuildXp(userId, guildId, xp);
	}

	/**
	 * Get XP leaderboard of a Discord guild.
	 * @param {String} guildId ID of the guild to get XP leaderboard of.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Leaderboard page.
	 */
	getGuildXpLeaderboard(guildId, startPosition = 0, items = 10) {
		this.checkEndpoint("getGuildXpLeaderboard");
		this.checkIfGuildExists(guildId);
		const leaderboard = this.db.prepare("select cast(UserId as text) as 'userId', Xp as 'xp', AwardedXp as 'awardedXp' from UserXpStats where GuildId=$guildId order by (xp + awardedXp) desc limit $items offset $startPosition").all({ guildId, items, startPosition });
		if (!leaderboard.length) throw new Error("Unable to fetch guild XP leaderboard.");
		return leaderboard.map((user, rank) => ({
			...this.calcLevel(user.xp + user.awardedXp),
			...user, rank: startPosition + rank + 1
		}));
	}

	/**
	 * Get XP role rewards of a Discord guild.
	 * @param {String} guildId ID of the guild to get XP role rewards of.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Role rewards page.
	 */
	getGuildXpRoleRewards(guildId, startPosition = 0, items = 10) {
		this.checkEndpoint("getGuildXpRoleRewards");
		this.checkIfGuildExists(guildId);
		const rewards = this.db.prepare("select a.DateAdded as 'dateAdded', a.Level as 'level', cast (a.RoleId as text) as 'roleId' from XpRoleReward a, XpSettings b, GuildConfigs c where a.XpSettingsId = b.Id AND b.GuildConfigId = c.Id AND c.GuildId = $guildId order by a.Level asc limit $items offset $startPosition")
			.all({ guildId, items, startPosition });
		if (!rewards.length) throw new Error("Unable to fetch role rewards.");
		return rewards;
	}

	/**
	 * Get XP currency rewards of a Discord guild.
	 * @param {String} guildId ID of the guild to get XP currency rewards of.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Currency rewards page.
	 */
	getGuildXpCurrencyRewards(guildId, startPosition = 0, items = 10) {
		this.checkEndpoint("getGuildXpCurrencyRewards");
		this.checkIfGuildExists(guildId);
		const rewards = this.db.prepare("select a.DateAdded as 'dateAdded', a.Level as 'level', a.Amount as 'amount' from XpCurrencyReward a, XpSettings b, GuildConfigs c where a.XpSettingsId = b.Id AND b.GuildConfigId = c.Id AND c.GuildId = $guildId order by a.Level asc limit $items offset $startPosition").all({ guildId, items, startPosition });
		if (!rewards.length) throw new Error("Unable to fetch currency rewards.");
		return rewards;
	}

	/**
	 * Get global ranking of a Discord user.
	 * @param {String} userId ID of the user to get global ranking of.
	 * @returns {Object} Rank info.
	 */
	getGlobalRank(userId) {
		this.checkEndpoint("getGlobalRank");
		this.checkIfUserExists(userId);
		const globalRankings = this.db.prepare("select cast(UserId as text) as 'id' from DiscordUser order by TotalXp desc").all().map(user => user.id);
		const rank = globalRankings.indexOf(userId) > -1 ? globalRankings.indexOf(userId) + 1 : globalRankings.length;
		return { userId, rank };
	}

	/**
 	* Get the global XP of a Discord user.
 	* @param {String} userId ID of the Discord user.
 	* @returns {Object} Information about the user's global XP.
 	*/
	getGlobalXp(userId) {
		this.checkEndpoint("getGlobalXp");
		this.checkIfUserExists(userId);
		const { globalXp } = this.db.prepare("select TotalXp as 'globalXp' from DiscordUser where UserId=$userId").get({ userId });
		if (!globalXp) throw new Error("Unable to get global Xp for this user.");
		const levelInfo = this.calcLevel(globalXp);
		if (!levelInfo) throw new Error("Unable to calculate level.");
		const rankInfo = this.getGlobalRank(userId);
		if (!rankInfo) throw new Error("Unable to get rank.");
		return { globalXp, ...levelInfo, rank: rankInfo.rank };
	}

	/**
	 * Get the global XP leaderboard.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Leaderboard page.
	 */
	getGlobalXpLeaderboard(startPosition = 0, items = 10) {
		this.checkEndpoint("getGlobalXpLeaderboard");
		const leaderboard = this.db.prepare("select cast(UserId as text) as 'userId', TotalXp as 'globalXp' from DiscordUser order by TotalXp desc limit $items offset $startPosition").all({ items, startPosition });
		if (!leaderboard.length) throw new Error("Unable to fetch global XP leaderboard.");
		return leaderboard.map((user, rank) => ({
			...user,
			...this.calcLevel(user.globalXp),
			rank: startPosition + rank + 1
		}));
	}

	/**
	 * Get club leaderboard.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Leaderboard page.
	 */
	getClubLeaderboard(startPosition = 0, items = 10) {
		this.checkEndpoint("getClubLeaderboard");
		const clubs = this.db.prepare("select (a.Name || \"#\" || a.Discrim) as name, cast(b.UserId as text) as owner, a.Xp as xp, a.ImageUrl as icon, a.MinimumLevelReq as levelRequirement, a.Description as description from Clubs a, DiscordUser b WHERE a.OwnerId = b.Id order by a.Xp desc limit $items offset $startPosition").all({ startPosition, items });
		if (!clubs.length) throw new Error("Unable to fetch clubs.");
		return clubs.map((club, rank) => ({
			...this.calcLevel(club.xp),
			...club, rank: rank + 1
		}));
	}

	/**
	 * Get club information by name.
	 * @param {Number} name Name of the club.
	 * @returns {Object} Information about the club.
	 */
	getClubInfo(name) {
		this.checkEndpoint("getClubInfo");
		const club = this.db.prepare("select(a.Name || \"#\" || a.Discrim) as clubName, cast(b.UserId as text) as owner, a.Xp as xp, a.ImageUrl as icon, a.MinimumLevelReq as levelRequirement, a.Description as description from Clubs a, DiscordUser b WHERE a.OwnerId = b.Id AND clubName = $name").get({ name });
		if (!club) throw new Error("No clubs exist with the specified name.");
		const levelInfo = this.calcLevel(club.xp);
		if (!levelInfo) throw new Error("Unable to calculate level info.");
		const rankings = this.db.prepare("select (Name || \"#\" || Discrim) as name from Clubs order by Xp desc").all().map(club => club.name);
		if (!rankings.length) throw new Error("Unable to get club ranking.");
		const rank = rankings.indexOf(name) < 0 ? rankings.length : rankings.indexOf(name) + 1;
		return {
			name: club.clubName,
			owner: club.owner,
			description: club.description,
			icon: club.icon,
			xp: club.xp,
			levelRequirement: club.levelRequirement,
			...levelInfo, rank
		};
	}

	/**
	 * Get club information by club member.
	 * @param {Number} userId ID of the club member.
	 * @returns {Object} Information about the club.
	 */
	getClubInfoByUser(userId) {
		this.checkEndpoint("getClubInfoByUser");
		this.checkIfUserExists(userId);
		const club = this.db.prepare("select(a.Name || \"#\" || a.Discrim) as clubName from Clubs a, DiscordUser b WHERE b.ClubId = a.Id AND b.UserId = $userId").get({ userId });
		if (!club) throw new Error("Club not found.");
		return this.getClubInfo(club.clubName);
	}

	/**
	 * Get club members by name.
	 * @param {Number} name Name of the club.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Members page.
	 */
	getClubMembers(name, startPosition = 0, items = 10) {
		this.checkEndpoint("getClubMembers");
		const members = this.db.prepare("select cast(a.UserId as text) as userId, a.TotalXp as xp, a.IsClubAdmin as admin from DiscordUser a, Clubs b where a.ClubId = b.Id AND (b.Name || \"#\" || b.Discrim)=$name order by xp desc limit $items offset $startPosition").all({ name, items, startPosition });
		if (!members.length) throw new Error("No members found for this club.");
		return members.map((member, rank) => {
			const levelInfo = this.calcLevel(member.xp);
			return {
				userId: member.userId,
				admin: member.admin > 0,
				xp: member.xp,
				level: levelInfo.level,
				levelXp: levelInfo.levelXp,
				rank: rank + 1
			};
		});
	}
}

module.exports = Connector;