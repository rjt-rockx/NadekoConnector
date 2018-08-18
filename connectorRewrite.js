const utils = require("./utils.js");
const knex = require("knex");
var config = utils.readJson("./config.json");

class Connector {

	/**
	 * Creates a new Connector for the specified configuration.
	 * @param {String} dbPath Path to the database (.db)
	 * @param {String} credentialsPath Path to the credentials file (.json)
	 * @param {[String]} [disabledEndpoints=[]] Endpoints to disable.
	 */
	constructor(dbPath, credentialsPath, disabledEndpoints) {
		this.db = new knex({
			client: "sqlite3",
			connection: {
				filename: dbPath
			},
			useNullAsDefault: true
		});
		this.credentials = utils.readJson(credentialsPath);
		this._endpoints = ["getBotInfo", "getTables", "getFields", "execSql", "getBalance", "setBalance", "createTransaction", "getTransactions", "getGuildRank", "getGlobalRank", "getGuildXp", "setGuildXp"];
		if (!disabledEndpoints)
			disabledEndpoints = [];
		this._disabledEndpoints = disabledEndpoints;
		this._init = false;
	}

	/**
	 * Gets available endpoints for the current Connector instance.
	 * @return {[String]} Array of available endpoints.
	 */
	get endpoints() {
		return this._endpoints.filter((element) => !this._disabledEndpoints.includes(element));
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
		this._disabledEndpoints = disabledEndpoints;
	}

	/**
	 * Get the initialization state of the connector.
	 * @returns {Boolean} Whether the connector is initialized or not.
	 */
	get initialized() {
		return this._init;
	}

	/**
	 * Check if the connector has been initialized or not.
	 */
	async checkInitialized() {
		if (!this._init)
			throw new Error("Connector not initialized. This may lead to unexpected errors.");
	}

	/**
	 * Check if the endpoint has been disabled.
	 */
	async checkEndpoint(endpoint) {
		await this.checkInitialized();
		if (this._disabledEndpoints.map(endpoint => endpoint.toLowerCase()).includes(endpoint.toLowerCase()))
			throw new Error("Endpoint disabled.");
	}

	/**
	 * Initialize the connector.
	 */
	async initialize() {
		this._init = true;
		await this.db.raw("PRAGMA journal_mode=OFF");
		await this.db.raw("PRAGMA locking_mode=NORMAL");
		await this.db.raw("PRAGMA synchronous=OFF");
		await this.db.raw("PRAGMA optimize");
	}

	/**
	 * Gets info about the bot.
	 * @returns {Object} Info about the bot.
	 */
	async getBotInfo() {
		await this.checkEndpoint("getBotInfo");
		let dbInfo = await this.db.first("CurrencySign", "CurrencyName", "CurrencyPluralName", "XpPerMessage", "XpMinutesTimeout").from("BotConfig");
		if (!dbInfo)
			throw new Error("Unable to fetch bot configuration.");
		if (!this.credentials)
			throw new Error("Unable to fetch bot credentials.");
		let info = {
			id: this.credentials.ClientId,
			owners: this.credentials.OwnerIds,
			currency: {
				sign: dbInfo.CurrencySign,
				name: dbInfo.CurrencyName,
				pluralName: dbInfo.CurrencyPluralName
			},
			xp: {
				perMessage: dbInfo.XpPerMessage,
				interval: dbInfo.XpMinutesTimeout
			}
		};
		return {
			bot: info
		};
	}

	/**
	 * Gets the tables present in the database.
	 * @returns {Object} Array of table names.
	 */
	async getTables() {
		await this.checkEndpoint("getTables");
		let tables = await this.db.select("name").from("sqlite_master").where({
			type: "table"
		}).map(table => table.name);
		if (!tables)
			throw new Error("Unable to list tables.");
		this.tables = tables;
		return {
			tables: tables
		};
	}

	/**
	 * Gets fields present in the specified table.
	 * @param {String} table Name of the table.
	 * @returns {Object} Array of field names.
	 */
	async getFields(table) {
		await this.checkEndpoint("getFields");
		if (!this.tables)
			this.tables = await this.getTables({}).tables;
		if (!this.tables.includes(table))
			throw new Error("Table not present.");
		let fields = await this.db.from(table).columnInfo();
		if (!fields)
			throw new Error("Unable to get fields.");
		return {
			fields: Object.keys(fields)
		};
	}

	/**
	 * Execute a raw SQL query and return the rows.
	 * @param {String} command The SQL command to execute.
	 * @returns {Object} Result of the command, array of rows if multiple rows were affected or a single JSON object if a single row was affected.
	 */
	async execSql(command) {
		await this.checkEndpoint("execSql");
		let result = await this.db.raw(command);
		let rowsAffected = result.length;
		if (!result)
			throw new Error("No rows were affected.");
		if (Array.isArray(result) && rowsAffected === 1)
			return {
				result: result[0]
			};
		return {
			result: result,
			rowsAffected: rowsAffected
		};
	}

	/**
	 * Check if a Discord guild exists in the database.
	 * @param {String} userId Guild ID.
	 */
	async checkIfGuildExists(guildId) {
		if (typeof guildId !== "string")
			throw new Error("IDs must be provided as strings to avoid loss of precision.");
		let guilds = await this.db.raw("select cast(GuildId as text) as 'guildId' from GuildConfigs").map(element => element.guildId);
		if (!guilds.includes(guildId))
			throw new Error("Guild not found.");
	}

	/**
	 * Check if a Discord user exists in the database.
	 * @param {String} userId User ID.
	 */
	async checkIfUserExists(userId) {
		if (typeof userId !== "string")
			throw new Error("IDs must be provided as strings to avoid loss of precision.");
		let users = await this.db.raw("select cast(UserId as text) as 'userId' from GuildConfigs;").map(element => element.userId);
		if (!users.includes(userId))
			throw new Error("User not found.");
	}

	/**
	 * Get the balance of a Discord user.
	 * @param {String} userId User ID to get the balance of.
	 * @returns {Object} Balance info about the specified user.
	 */
	async getBalance(userId) {
		await this.checkEndpoint("getBalance");
		await this.checkIfUserExists(userId);
		let info = await this.db.raw(`select cast(UserId as text) as 'userId', CurrencyAmount as 'balance' from DiscordUser where UserId = ${userId}`);
		if (!info)
			throw new Error("Unable to fetch balance.");
		return info[0];
	}

	/**
	 * Get the balance of a Discord user.
	 * @param {String} userId User ID to get the balance of.
	 * @returns {Object} Balance info about the specified user.
	 */
	async setBalance(userId, balance) {
		await this.checkEndpoint("setBalance");
		await this.checkIfUserExists(userId);
		let updatedRows = await this.db.from("DiscordUser").update({ CurrencyAmount: balance }).where({ UserId: userId });
		if (updatedRows < 1)
			throw new Error("Unable to update balance.");
		return {
			userId: userId,
			balance: balance
		};
	}

	/**
	 * Create a transaction for a Discord user.
	 * @param {String} userId User ID to create a transaction for.
	 * @param {Number} amount Amount added to or subtracted from the user.
	 * @param {String} reason Reason for the transaction.
	 * @returns {Object} Transaction info.
	 */
	async createTransaction(userId, amount, reason) {
		await this.checkEndpoint("createTransaction");
		let dateAdded = new Date().toISOString().replace(/[TZ]/g, " ");
		let row = await this.db.from("CurrencyTransactions").insert({
			UserId: userId,
			Amount: amount,
			Reason: reason,
			DateAdded: dateAdded
		});
		if (!row)
			throw new Error("Unable to create a transaction.");
		return {
			userId: userId,
			transactionId: row[0]
		};
	}

	/**
	 * Get transactions of a Discord user.
	 * @param {String} userId ID of the user to get transactions of.
	 * @param {Number} startPosition Start position/offset of transactions.
	 * @param {Number} items Items per page.
	 * @returns {Object} Transactions.
	 */
	async getTransactions(userId, startPosition, items) {
		await this.checkEndpoint("getTransactions");
		await this.checkIfUserExists(userId);
		let transactions = await this.db.raw(`select Id as 'transactionId', Amount as 'amount', Reason as 'reason', DateAdded as 'dateAdded' from CurrencyTransactions where UserId = ${userId} order by Id desc limit ${items} offset ${startPosition}`);
		if (!transactions)
			throw new Error("User not found.");
		return {
			userId: userId,
			transactions: transactions
		};
	}

	/**
	 * Get ranking of a Discord user in a specific guild.
	 * @param {String} userId ID of the user to get guild ranking of.
	 * @param {String} guildId ID of the guild to get rankings of.
	 * @returns {Object} Rank info.
	 */
	async getGuildRank(userId, guildId) {
		await this.checkEndpoint("getGuildRank");
		await this.checkIfUserExists(userId);
		await this.checkIfGuildExists(guildId);
		let guildRankings = await this.db.raw(`select cast(UserId as text) as 'id' from UserXpStats where GuildId=${guildId} order by Xp+AwardedXp desc`).map(user => user.id);
		if (!guildRankings)
			throw new Error("Unable to get guild rankings.");
		let rank = await guildRankings.indexOf(userId);
		if (rank < 0)
			rank = guildRankings.length;
		return { userId: userId, rank: ++rank };
	}

	/**
	 * Get the guild XP of a Discord user.
	 * @param {String} userId ID of the Discord user.
	 * @param {String} guildId ID of the Discord server.
	 * @returns {Object} Information about the user's XP.
	 */
	async getGuildXp(userId, guildId) {
		await this.checkEndpoint("getGuildXp");
		await this.checkIfUserExists(userId);
		await this.checkIfGuildExists(guildId);
		let xpInfo = await this.db.first("Xp", "AwardedXp").from("UserXpStats").where({
			UserId: userId,
			GuildId: guildId
		});
		if (!xpInfo)
			throw new Error("Unable to find the user/guild.");
		let levelInfo = utils.calcLevel(xpInfo.Xp + xpInfo.AwardedXp);
		if (!levelInfo)
			throw new Error("Unable to calculate level.");
		let rankInfo = await this.getGuildRank(userId, guildId);
		if (!rankInfo)
			throw new Error("Unable to get rank.");
		return {
			guildXp: xpInfo.Xp,
			awardedXp: xpInfo.AwardedXp,
			totalXp: xpInfo.Xp + xpInfo.AwardedXp,
			level: levelInfo.level,
			levelXp: levelInfo.levelXp,
			requiredXp: levelInfo.requiredXp,
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
	async setGuildXp(userId, guildId, xp, awardedXp) {
		await this.checkEndpoint("setGuildXp");
		await this.checkIfUserExists(userId);
		await this.checkIfGuildExists(guildId);
		let updatedRows = await this.db.from("UserXpStats").update({ Xp: xp, AwardedXp: awardedXp }).where({ UserId: userId, GuildId: guildId });
		if (updatedRows < 1)
			throw new Error("Unable to update guild XP.");
		let xpInfo = await this.getGuildXp(userId, guildId);
		if (!xpInfo)
			throw new Error("Unable to fetch XP info.");
		return xpInfo;
	}

	/**
	 * Get XP leaderboard of a Discord guild.
	 * @param {String} guildId ID of the user to get XP leaderboard of.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Leaderboard page.
	 */
	async getGuildXpLeaderboard(guildId, startPosition, items) {
		await this.checkEndpoint("getGuildXpLeaderboard");
		await this.checkIfGuildExists(guildId);
		let leaderboard = await this.db.raw(`select cast(UserId as text) as 'userId', Xp as 'xp', AwardedXp as 'awardedXp' from UserXpStats where GuildId=${guildId} order by (xp + awardedXp) desc limit ${items} offset ${startPosition}`);
		if (!leaderboard)
			throw new Error("Unable to fetch guild XP leaderboard.");
		return {
			leaderboard: leaderboard
		};
	}

	/**
	 * Get XP role rewards of a Discord guild.
	 * @param {String} guildId ID of the user to get XP role rewards of.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Leaderboard page.
	 */
	async getGuildXpRoleRewards(guildId, startPosition, items) {
		await this.checkEndpoint("getGuildXpRoleRewards");
		await this.checkIfGuildExists(guildId);
		let rewards = await this.db.raw(`select a.DateAdded as 'dateAdded', a.Level as 'level', cast (a.RoleId as text) as 'roleId' from XpRoleReward a, XpSettings b, GuildConfigs c where a.XpSettingsId = b.Id AND b.GuildConfigId = c.Id AND c.GuildId = ${guildId} order by a.Level asc limit ${items} offset ${startPosition}`);
		if (!rewards)
			throw new Error("Unable to fetch role rewards.");
		return {
			rewards: rewards
		};
	}

	/**
	 * Get global ranking of a Discord user.
	 * @param {String} userId ID of the user to get global ranking of.
	 * @returns {Object} Rank info.
	 */
	async getGlobalRank(userId) {
		await this.checkEndpoint("getGlobalRank");
		await this.checkIfUserExists(userId);
		let globalRankings = await this.db.raw("select cast(UserId as text) as 'id' from UserXpStats group by UserId order by sum(Xp) desc").map(user => user.id);
		let rank = await globalRankings.indexOf(userId);
		if (rank < 0)
			rank = globalRankings.length;
		return { userId: userId, rank: ++rank };
	}

	/**
 	* Get the global XP of a Discord user.
 	* @param {String} userId ID of the Discord user.
 	* @returns {Object} Information about the user's global XP.
 	*/
	async getGlobalXp(userId) {
		await this.checkEndpoint("getGlobalXp");
		await this.checkIfUserExists(userId);
		let { globalXp } = await this.db.from("UserXpStats").where({ UserId: userId }).sum({ globalXp: "Xp" })[0];
		if (!globalXp)
			throw new Error("User not found.");
		let levelInfo = utils.calcLevel(globalXp);
		if (!levelInfo)
			throw new Error("Unable to calculate level.");
		let rankInfo = await this.getGlobalRank(userId);
		if (!rankInfo)
			throw new Error("Unable to get rank.");
		return {
			globalXp: globalXp,
			level: levelInfo.level,
			levelXp: levelInfo.levelXp,
			requiredXp: levelInfo.requiredXp,
			rank: rankInfo.rank
		};
	}

	/**
	 * Get the global XP leaderboard.
	 * @param {Number} startPosition Start position/offset of the page.
	 * @param {Number} items Items per page.
	 * @returns {Object} Leaderboard page.
	 */
	async getGlobalXpLeaderboard(startPosition, items) {
		await this.checkEndpoint("getGlobalXpLeaderboard");
		let leaderboard = await this.db.raw(`select cast(UserId as text) as 'userId', sum(Xp) as 'xp' from UserXpStats group by userId order by sum(Xp) desc limit ${items} offset ${startPosition}`);
		if (!leaderboard)
			throw new Error("Unable to fetch global XP leaderboard.");
		return {
			leaderboard: leaderboard
		};
	}

}

module.exports = Connector;