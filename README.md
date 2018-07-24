<h1 align=center>NadekoConnector</h1>
<p align=center><b>Exposes parts of the NadekoBot database for modification through unique Authentication Keys. </b></p>

## Setup

- Run `npm i` to install all required dependencies.
- Set the paths to `NadekoBot.db` and `credentials.json` in `config.json`.
- Modify the `password` in `config.json`.
- Run `node server.js`.

## Endpoints

- getBotInfo
- getTables
- getFields
- getBalance
- setBalance
- createTransaction
- getTransactions
- getGuildXp
- setGuildXp
- getGuildXpLeaderboard
- getGuildXpRoleRewards
- getGuildXpCurrencyRewards
- getGlobalXp
- getGlobalXpLeaderboard
