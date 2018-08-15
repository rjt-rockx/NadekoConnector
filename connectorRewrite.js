const utils = require("./utils.js");
const knex = require("knex");

class Connector {

	/**
	 * Creates a new Connector for the specified configuration.
	 * @param {Object} config Configuration to initialize the Connector with.
	 * @param {String} config.dbPath Path to the database (.db)
	 * @param {String} config.credentialsPath Path to the credentials file (.json)
	 * @param {[String]} [disabledEndpoints=[]] Endpoints to disable.
	 */
	constructor({ dbPath, credentialsPath }, disabledEndpoints) {
		this.db = new knex({
			client: "sqlite3",
			connection: {
				filename: dbPath
			},
			useNullAsDefault: true
		});
		this.credentials = utils.readJson(credentialsPath);
		this._endpoints = [];
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
	 * Check if the connector is initialized or not.
	 * @returns {Boolean} Whether the connector is initialized or not.
	 */
	get initialized() {
		return this._init;
	}

	checkInitialized() {
		if (!this._init)
			throw new Error("Connector not initialized. This may lead to unexpected errors.");
	}

	/**
	 * Initialize the connector.
	 */
	async initialize() {
		this._init = true;
		await this.execSql({ command: "PRAGMA journal_mode=OFF" });
		await this.execSql({ command: "PRAGMA locking_mode=NORMAL" });
		await this.execSql({ command: "PRAGMA synchronous=OFF" });
		await this.execSql({ command: "PRAGMA optimize" });
	}

	/**
	 * Gets info about the bot.
	 * @param {Object} data Empty object
	 * @returns {Object} Info about the bot
	 */
	async getBotInfo() {
		this.checkInitialized();
		let dbInfo = await this.db.first("CurrencySign", "CurrencyName", "CurrencyPluralName", "XpPerMessage", "XpMinutesTimeout").from("BotConfig");
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
	 * @param {Object} data Empty object.
	 * @returns {Object} Array of tablenames.
	 */
	async getTables({ }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("getTables"))
			throw new Error("Endpoint disabled.");
		let tables = await this.db.select("name").from("sqlite_master").where({
			type: "table"
		}).map(table => table.name);
		return {
			tables: tables
		};
	}

	/**
	 * Gets fields present in the specified table.
	 * @param {Object} data Object containing the name of the table.
	 * @param {String} data.table Name of the table.
	 * @returns {Object} Array of field names.
	 */
	async getFields({ table }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("getFields"))
			throw new Error("Endpoint disabled.");
		let existingTables = this.getTables({}).tables;
		if (!existingTables.includes(table))
			throw new Error(`${table} is not present in the database. `);
		let fields = await this.db.from(table).columnInfo();
		return {
			fields: Object.keys(fields)
		};
	}

	/**
	 * Execute a raw SQL query and return the rows.
	 * @param {Object} data Object containing the command to execute
	 * @param {String} data.command The SQL command to execute
	 * @returns {Object} Result of the command, array of rows if multiple rows were affected or a single JSON object if a single row was affected.
	 */
	async execSql({ command }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("execSql"))
			throw new Error("Endpoint disabled.");
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
	 * Get the balance of a Discord user.
	 * @param {Object} data Object containing the user ID to get the balance of.
	 * @param {String} data.userId User ID to get the balance of.
	 * @returns {Object} Balance info about the specified user.
	 */
	async getBalance({ userId }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("getBalance"))
			throw new Error("Endpoint disabled.");
		let info = await this.db.raw(`select cast(UserId as text) as 'userId', CurrencyAmount as 'balance' from DiscordUser where UserId = ${userId}`);
		if (!info)
			throw new Error("User not found.");
		return info[0];
	}

	/**
	 * Get the balance of a Discord user.
	 * @param {Object} data Object containing the user ID to get the balance of.
	 * @param {String} data.userId User ID to get the balance of.
	 * @returns {Object} Balance info about the specified user.
	 */
	async setBalance({ userId, balance }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("setBalance"))
			throw new Error("Endpoint disabled.");
		let updatedRows = await this.db.from("DiscordUser").update({ CurrencyAmount: balance }).where({ UserId: userId });
		if (updatedRows < 1)
			throw new Error("User not found.");
		return {
			userId: userId,
			balance: balance
		};
	}

	/**
	 * Create a transaction for a Discord user
	 * @param {Object} data Object containing transaction details.
	 * @param {String} data.userId User ID to create a transaction for
	 * @param {Number} data.amount Amount added to or subtracted from the user
	 * @param {String} data.reason Reason for the transaction
	 * @returns {Object} Transaction info
	 */
	async createTransaction({ userId, amount, reason }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("createTransaction"))
			throw new Error("Endpoint disabled.");
		let dateAdded = new Date().toISOString().replace(/[TZ]/g, " ");
		let row = await this.db.from("CurrencyTransactions").insert({
			UserId: userId,
			Amount: amount,
			Reason: reason,
			DateAdded: dateAdded
		});
		return {
			userId: userId,
			transactionId: row[0]
		};
	}

	/**
	 * Get transactions of a Discord user
	 * @param {Object} data Object containing user ID and pagination info
	 * @param {String} data.userId ID of the user to get transactions of
	 * @param {Number} data.startPosition Start position/offset of transactions
	 * @param {Number} data.items Items per page
	 * @returns {Object} Transactions
	 */
	async getTransactions({ userId, startPosition, items }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("getTransactions"))
			throw new Error("Endpoint disabled.");
		let transactions = await this.db.raw(`select Id as 'transactionId', Amount as 'amount', Reason as 'reason', DateAdded as 'dateAdded' from CurrencyTransactions where UserId = ${userId} order by Id desc limit ${items} offset ${startPosition}`);
		if (!transactions)
			throw new Error("User not found.");
		return {
			userId: userId,
			transactions: transactions
		};
	}

	/**
	 * Get ranking of a Discord user in a specific guild
	 * @param {Object} data Object containing user ID and guild ID
	 * @param {String} data.userId ID of the user to get guild ranking of
	 * @param {String} data.guildId ID of the guild to get rankings of
	 * @returns {Object} Rank info
	 */
	async getGuildRank({ userId, guildId }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("getGuildRank"))
			throw new Error("Endpoint disabled.");
		let guildRankings = await this.db.raw(`select cast(UserId as text) as 'id' from UserXpStats where GuildId=${guildId} order by Xp+AwardedXp desc`).map(user => user.id);
		if (!guildRankings)
			throw new Error("Guild not found.");
		let rank = await guildRankings.indexOf(userId);
		if (rank < 0)
			rank = guildRankings.length;
		return { userId: userId, rank: ++rank };
	}

	/**
	 * Get global ranking of a Discord user
	 * @param {Object} data Object containing user ID
	 * @param {String} data.userId ID of the user to get global ranking of
	 * @returns {Object} Rank info
	 */
	async getGlobalRank({ userId }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("getGlobalRank"))
			throw new Error("Endpoint disabled.");
		let globalRankings = await this.db.raw("select cast(UserId as text) as 'id' from UserXpStats group by UserId order by sum(Xp) desc").map(user => user.id);
		let rank = await globalRankings.indexOf(userId);
		if (rank < 0)
			rank = globalRankings.length;
		return { userId: userId, rank: ++rank };
	}

	/**
	 * Get the guild XP of a Discord user
	 * @param {Object} data Object containing user ID and guild ID to get XP stats of.
	 * @param {String} data.userId ID of the Discord user
	 * @param {String} data.guildId ID of the Discord server
	 * @returns {Object} Information about the user's XP.
	 */
	async getGuildXp({ userId, guildId }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("getGuildXp"))
			throw new Error("Endpoint disabled.");
		let xpInfo = await this.db.first("Xp", "AwardedXp").from("UserXpStats").where({
			UserId: userId,
			GuildId: guildId
		});
		if (!xpInfo)
			throw new Error("User/guild not found.");
		let levelInfo = utils.calcLevel(xpInfo.Xp + xpInfo.AwardedXp);
		if (!levelInfo)
			throw new Error("Unable to calculate level.");
		return {
			guildXp: xpInfo.Xp,
			awardedXp: xpInfo.AwardedXp,
			totalXp: xpInfo.Xp + xpInfo.AwardedXp,
			level: levelInfo.level,
			levelXp: levelInfo.levelXp,
			requiredXp: levelInfo.requiredXp
		};
	}

	/**
	 * Set the guild XP of a Discord user
	 * @param {Object} data Object containing user ID and guild ID to set XP of.
	 * @param {String} data.userId ID of the Discord user
	 * @param {String} data.guildId ID of the Discord server
	 * @param {String} data.xp XP of the Discord server
	 * @param {String} data.awardedXp XP awarded to the Discord server
	 * @returns {Object} Information about the user's XP.
	 */
	async setGuildXp({ userId, guildId, xp, awardedXp }) {
		this.checkInitialized();
		if (this._disabledEndpoints.includes("setGuildXp"))
			throw new Error("Endpoint disabled.");
		let updatedRows = await this.db.from("UserXpStats").update({ Xp: xp, AwardedXp: awardedXp }).where({ UserId: userId, GuildId: guildId });
		if (updatedRows < 1)
			throw new Error("User/guild not found.");
		let xpInfo = await this.db.first("Xp", "AwardedXp").from("UserXpStats").where({ UserId: userId, GuildId: guildId });
		if (!xpInfo)
			throw new Error("User/guild not found.");
		let levelInfo = utils.calcLevel(xpInfo.Xp + xpInfo.AwardedXp);
		if (!levelInfo)
			throw new Error("Unable to calculate level.");
		return {
			guildXp: xpInfo.Xp,
			awardedXp: xpInfo.AwardedXp,
			totalXp: xpInfo.Xp + xpInfo.AwardedXp,
			level: levelInfo.level,
			levelXp: levelInfo.levelXp,
			requiredXp: levelInfo.requiredXp
		};
	}
}

module.exports = Connector;