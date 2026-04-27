# LIQUIDITY LOCK DASHBOARD

[![Deployed on Sepolia](https://img.shields.io/badge/Etherscan-Verified-brightgreen)](https://sepolia.etherscan.io/address/0x1BA24F8ebA2d865493b8e4B3D6cd1bDe8d42338B#code)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![React](https://img.shields.io/badge/Built%20with-React-blue)
![Ethers.js](https://img.shields.io/badge/Ethers.js-5.8-purple)

Built by [Tredway Development](https://tredwaydev.com) — professional Solidity smart contract packages for Web3 companies.

A production-ready React dashboard for the LiquidityLock smart contract. Allows projects to lock LP tokens, prove liquidity commitment to investors, and withdraw tokens after the unlock period expires.

> ⚠️ This dashboard connects to contracts deployed on Sepolia testnet. A full security audit is strongly recommended before any mainnet deployment.

## LIVE DEMO

[token-liquidity-lock-dashboard.netlify.app](https://token-liquidity-lock-dashboard.netlify.app)

## PROJECT GOALS

The purpose of this dashboard is to give projects and their communities a clear, trustless interface for managing liquidity locks.

Users can lock any ERC-20 LP token for a set period of time, monitor their active locks with a live countdown timer, and withdraw tokens once the unlock period has passed. No admin controls. No backdoors. The contract is the authority.

## DASHBOARD FEATURES

LOCK TOKENS

Connect any ERC-20 LP token address and the dashboard automatically previews the token name and symbol. Enter an amount and unlock date to lock tokens into the contract with a single transaction.

LIVE COUNTDOWN TIMER

Each active lock displays a live ticking countdown showing exactly how much time remains before withdrawal is available.

MULTIPLE LOCKS

A single wallet can manage multiple locks simultaneously across different tokens and unlock periods.

WITHDRAW

The withdraw button is grayed out and locked until the unlock time passes. Once unlocked it turns green and withdrawal is one click away.

ACTIVE / ALL FILTER

Filter between active locks and full lock history including withdrawn locks.

WRONG NETWORK PROTECTION

The dashboard detects the connected network and alerts the user if they are not on Sepolia or Localhost 8545.

ETHERSCAN INTEGRATION

Successful transactions on Sepolia link directly to Etherscan for full transparency.

## TECHNOLOGY STACK

React — Frontend framework

Ethers.js 5.8 — Contract interaction library

Solidity 0.8.19 — Smart contract language

Hardhat — Development and deployment environment

OpenZeppelin — Audited smart contract libraries

Alchemy — Ethereum RPC provider

Sepolia Test Network — Deployment environment

MetaMask — Wallet connection

## PROJECT STRUCTURE

src/
    App.js
    App.css
    contracts/
        LiquidityLock.json
        SampleToken.json
        localhost.json
        sepolia.json

public/
    td-logo-justtd.png

## INSTALLATION

### CLONE THE REPOSITORY:

git clone https://github.com/Ktredway0128/token-liquidity-lock-dashboard.git

cd token-liquidity-lock-dashboard

### INSTALL DEPENDENCIES:

npm install

### ADD ENVIRONMENT VARIABLE:

Create a .env file in the root directory:

REACT_APP_ALCHEMY_URL=YOUR_SEPOLIA_RPC_URL

### START THE DASHBOARD:

npm start

## LOCAL DEVELOPMENT

To run against a local Hardhat node:

1. Start the Hardhat node in your contract project:

npx hardhat node

2. Deploy the contracts locally:

npx hardhat run scripts/deploy-demo.js --network localhost

3. Update src/contracts/localhost.json with the deployed addresses

4. Connect MetaMask to Localhost 8545 and import a Hardhat test account

5. Start the dashboard and connect your wallet

## SEPOLIA TESTNET DEPLOYMENT

| Contract | Address | Etherscan |
|----------|---------|-----------|
| LiquidityLock | `0x1BA24F8ebA2d865493b8e4B3D6cd1bDe8d42338B` | [View on Etherscan](https://sepolia.etherscan.io/address/0x1BA24F8ebA2d865493b8e4B3D6cd1bDe8d42338B#code) |

Deployed: 2026-04-27

## CONNECTED CONTRACT

This dashboard connects to the LiquidityLock smart contract.

Contract repository: [token-liquidity-lock](https://github.com/Ktredway0128/token-liquidity-lock)

## SECURITY PRACTICES

No admin keys or owner controls — the contract is the sole authority

SafeERC20 used for all token transfers

ReentrancyGuard on all state-changing functions

State updated before external calls

Wrong network detection prevents accidental transactions

## AUTHOR

Kyle Tredway

Smart Contract Developer / Token Launch Specialist

tredwaydev.com | @kyletredwaydev

## LICENSE

MIT License