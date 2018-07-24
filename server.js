var utils = require("./utils.js");
var authmanager = require("./authmanager.js");
var express = require("express");
var app = express();
var config = utils.readJson("./config.json");
var package = utils.readJson("./package.json");
var log = require("fancy-log");
var helmet = require("helmet");

app.use(helmet());
app.enable("trust proxy");
app.use(function (req, res, next) {
	try {
		res.append("content-type", "application/json; charset = utf-8");
		log(`${req.ip.split(":")[3]} ${req.method} ${req.path}`);
	} catch (error) {
		log(`Error: ${error.message}`);
	}
	next();
});

var activeEndpoints = utils.getActiveEndpoints().activeEndpoints;

activeEndpoints.forEach((endpoint) => {
	if (config.endpoints[endpoint]) {
		app.get(`/${endpoint.toLowerCase()}`, async function (req, res) {
			try {
				var result = await utils.handleEndpoint(req.query, endpoint);
				if (!result.success)
					throw new Error(result.error);
				res.json(utils.success(result));
			}
			catch (error) {
				log(`Error: ${error.message}`);
				res.end(utils.failure({ error: error.message }, true));
			}
		});
	}
});

app.listen(config.port, () => {
	console.log(`NadekoConnector ${package.version}`);
	console.log(`${package.description}`);
	console.log(`Active endpoints: ${activeEndpoints}`);
	console.log(`Listening at http://${utils.getIpAddress().ipAddress}:${config.port}/`);
});

process.on("unhandledRejection", error => {
	log(`Error: Unhandled Promise Rejection \n ${error.toString()}`);
});