var jsonbs = require("json-bigint")({ storeAsString: true });
var authm = require("./authmanager.js");
var os = require("os");
var fs = require("fs");
var path = require("path");
var log = require("fancy-log");

var readJson = function (pathToFile) {
	if (!fs.existsSync(pathToFile))
		throw new Error("File not found.");
	var data = fs.readFileSync(pathToFile).toString();
	var info = jsonbs.parse(data);
	return info;
};

var handleEndpoint = async function (query, endpoint) {
	try {
		var connector = require("./connector.js");
	if (Object.keys(query) === null) throw new Error("Empty query.");
	if (!Object.keys(query).includes("authKey")) throw new Error("No Authentication key specified.");
	var authCheck = await authm.checkAuthKey(query.authKey, endpoint);
	if (!authCheck.success) return failure(authCheck);
	var data = checkProperties(query, endpoint);
	if (!data.success) return failure(data);
	var info = await connector[endpoint](data);
	if (!info.success) return failure(info);
	return success(info);
	}
	catch(error)
	{
		return failure({ error: error.message });
	}
};

var calcLevel = (xp) => {
	try {
		let lvl = 0,
			gap = 0;
		for (var i in [...Array(1000).keys()]) {
			gap = 36 + (9 * i);
			if (xp >= gap) {
				xp -= gap;
				lvl++;
			}
			if (xp < gap)
				break;
		}
		return success({
			level: lvl,
			currentLevelXp: xp,
			nextLevelXp: gap
		});
	}
	catch (error) {
		return failure({ error: error.message });
	}
};

var success = function (data, stringify) {
	if (!data)
		data = {};
	data["success"] = true;
	if (stringify)
		return jsonbs.stringify(data);
	return data;
};

var failure = function (data, stringify) {
	if (!data)
		data = {};
	if (!data["error"])
		data["error"] = "An error occured.";
	data["success"] = false;
	if (stringify)
		return jsonbs.stringify(data);
	return data;
};

var getConfig = function () {
	return readJson("./config.json");
};

var getCredentials = function () {
	var config = getConfig();
	return readJson(config.bot.credentials);
};

var getPackage = function () {
	return readJson("./package.json");
};

var updateConfig = function (newConfig, property, value) {
	if (!newConfig) {
		newConfig = readJson("./config.json");
	}
	if (!property && !value) {
		newConfig[property] = value;
	}
	try {
		fs.writeFileSync(path.resolve("./config.json"), jsonbs.stringify(newConfig, null, 4), "utf8");
		return success();
	} catch (error) {
		return failure({ error: error.message });
	}
};

var addAuthKey = function (key) {
	try {
		var existingAuthKeys = [];
		if (fs.existsSync("./keys.json"))
			existingAuthKeys = readJson("./keys.json");
		if (!existingAuthKeys.includes(key))
			existingAuthKeys.push(key);
		fs.writeFileSync(path.resolve("./keys.json"), jsonbs.stringify(existingAuthKeys, null, 4), "utf8");
		return success();
	} catch (error) {
		return failure({ error: error.message });
	}
};

var deleteAuthKeys = function () {
	try {
		var existingAuthKeys = [];
		fs.writeFileSync(path.resolve("./keys.json"), jsonbs.stringify(existingAuthKeys, null, 4), "utf8");
		return success();
	} catch (error) {
		return failure({ error: error.message });
	}
};

var getAuthKeys = function () {
	var authKeys = readJson("./keys.json");
	return authKeys;
};

var getIpAddress = function () {
	try {
		let ifaces = os.networkInterfaces();
		let ipAddress;
		Object.keys(ifaces).forEach(function (ifname) {
			ifaces[ifname].forEach(function (iface) {
				if ("IPv4" !== iface.family || iface.internal !== false) {
					return;
				}
				if (iface.address !== null && iface.address !== undefined)
					ipAddress = iface.address;
			});
		});
		return success({ ipAddress: ipAddress });
	}
	catch (error) {
		return failure({ error: error.message });
	}
};

var getActiveEndpoints = function () {
	var config = getConfig();
	try {
		let activeEndpoints = [];
		let endpoints = Object.keys(config.endpoints);
		endpoints.forEach((endpoint) => {
			if (config.endpoints[endpoint])
				activeEndpoints.push(endpoint);
		});
		return success({ activeEndpoints: activeEndpoints });
	}
	catch (error) {
		return failure({ error: error.message });
	}
};

var checkProperties = function (obj, endpoint) {
	try {
		let keys = Object.keys(obj).sort();
		let requiredKeys = getRequiredKeys(endpoint).keys;
		if (requiredKeys.every(val => keys.includes(val))) {
			return success(obj);
		}
	} catch (error) {
		return failure({ error: "Invalid properties specified." });
	}
};

var getRequiredKeys = function (endpoint) {
	switch (endpoint) {
		case "getBotInfo":
		case "getTables":
			return success({
				keys: []
			});
		case "getFields":
			return success({
				keys: ["table"]
			});
		case "getBalance":
		case "getGlobalXp":
			return success({
				keys: ["userId"]
			});
		case "setBalance":
			return success({
				keys: ["userId", "balance"]
			});
		case "createTransaction":
			return success({
				keys: ["userId", "amount", "reason"]
			});
		case "getGuildXp":
			return success({
				keys: ["userId", "guildId"]
			});
		case "setGuildXp":
			return success({
				keys: ["userId", "guildId", "awardedXp"]
			});
		case "getGuildXpLeaderboard":
		case "getGuildXpRoleRewards":
		case "getGuildXpCurrencyRewards":
			return success({
				keys: ["guildId", "startPosition", "items"]
			});
		case "getTransactions":
			return success({
				keys: ["userId", "startPosition", "items"]
			});
		case "getGlobalXpLeaderboard":
			return success({
				keys: ["startPosition", "items"]
			});
		default:
			return failure();
	}
};

var stringify = (data) => jsonbs.stringify(data);

var logAsync = async function (data) {
	log(await Promise.resolve(data));
};

exports.logAsync = logAsync;
exports.success = success;
exports.failure = failure;
exports.addAuthKey = addAuthKey;
exports.getAuthKeys = getAuthKeys;
exports.deleteAuthKeys = deleteAuthKeys;
exports.getConfig = getConfig;
exports.updateConfig = updateConfig;
exports.getCredentials = getCredentials;
exports.getPackage = getPackage;
exports.calcLevel = calcLevel;
exports.readJson = readJson;
exports.stringify = stringify;
exports.getIpAddress = getIpAddress;
exports.getActiveEndpoints = getActiveEndpoints;
exports.checkProperties = checkProperties;
exports.handleEndpoint = handleEndpoint;