var utils = require("./utils.js");
var Cryptr = require("cryptr");
var jsonbs = require("json-bigint");

var createAuthKey = async function (userId, guildId, endpoints) {
	try {
		var cryptr = new Cryptr(utils.getConfig().password);
		var data = jsonbs.stringify({ userId: userId, guildId: guildId, endpoints: endpoints });
		var authKey = await cryptr.encrypt(data);
		await utils.addAuthKey(authKey);
		return utils.success({ authKey: authKey });
	} catch (error) {
		return utils.failure({ error: error.message });
	}
};

var checkAuthKey = async function (key, endpoint, guildId) {
	try {
		var cryptr = new Cryptr(utils.getConfig().password);
		var existingKeys = await utils.getAuthKeys();
		if (!existingKeys.includes(key))
			throw new Error("Invalid key.");
		var data = await jsonbs.parse(cryptr.decrypt(key));
		if (!data.endpoints.includes(endpoint))
			throw new Error("Endpoint not allowed by this key.");
		if (data.endpoints.includes(endpoint))
			if (guildId)
				if (data.guildId !== guildId)
					throw new Error("Guild not allowed by this key.");
		return utils.success();
	} catch (error) {
		return utils.failure({ error: error.message });
	}
};

var getAuthKeys = async function () {
	var existingKeys = await utils.getAuthKeys();
	return existingKeys;
};

exports.createAuthKey = createAuthKey;
exports.checkAuthKey = checkAuthKey;
exports.getAuthKeys = getAuthKeys;