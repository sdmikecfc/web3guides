# Doma Protocol: Complete Context Guide

## Executive Overview

Doma Protocol is the world's first DNS-compliant blockchain specifically designed to tokenize internet domains and unlock liquidity in the $360+ billion domain industry. Built as an EVM-compatible Layer 2 on the OP Stack, Doma transforms traditional Web2 domains (.com, .ai, .xyz) and future Web3 extensions (.sol, .avax, .ape) into programmable, tradable real-world assets (RWAs).

**Developer:** D3 Global  
**Launch Date:** Mainnet launched November 25, 2025  
**Testnet Period:** June–November 2025 (5 months)  
**Funding:** $25M Series A led by Paradigm (January 2025)  
**Key Investors:** Paradigm, Coinbase Ventures, Sandeep Nailwal (Polygon), Dharmesh Shah (HubSpot), Richard Kirkendall (Namecheap)

---

## The Problem Doma Solves

### Current Domain Market Challenges

The traditional domain industry faces significant inefficiencies despite being a massive asset class:

- **Illiquidity:** Premium domains often take 6-18 months to find buyers
- **High Friction:** Broker fees range from 10-20% of sale price
- **Slow Settlement:** Escrow and transfer processes take 4-8 weeks
- **Limited Payment Options:** Cannot pay with cryptocurrency
- **High Barriers:** Six-figure price tags lock out most potential investors
- **Fragmented Market:** Sell-through rates below 3% annually
- **Manual Processes:** Every transfer requires manual registrar coordination

Only approximately $185 million in domain resales were recorded across 144,700 transactions in 2024, despite 371+ million registered domains globally.

---

## Core Technology & Architecture

### Layer 2 Infrastructure

Doma operates as an EVM-compatible Layer 2 built on the **OP Stack**, providing:

- Fast, low-cost transactions
- Ethereum Virtual Machine compatibility
- Seamless integration with existing Web3 infrastructure
- LayerZero integration for cross-chain interoperability

### The Dual-Token System

Doma introduces two revolutionary ERC-20 token primitives that separate ownership from functionality:

#### 1. Domain Ownership Tokens (DOTs)
- Represent title and transfer rights to the domain
- Enable seamless trading and ownership transfers
- Can be fractionalized for partial ownership
- Tradable 24/7 on decentralized exchanges
- Bridge across multiple blockchain networks

#### 2. Domain Service Tokens (DSTs)
- Govern DNS-level functionality
- Control DNS settings, nameservers, and DNS records
- Ensure tokenized domains retain real-world utility
- Enable domains to function normally for websites and email
- Can be separated from ownership for advanced use cases

**Critical Distinction:** This dual-token architecture allows domains to remain fully functional (hosting websites, routing email) while simultaneously being tradable assets. You can sell ownership while retaining operational control, or vice versa.

### ICANN Compliance & DNS Integration

Unlike alternative domain systems (Unstoppable Domains, Handshake, ENS), Doma is **fully DNS-compliant**:

- Works with existing ICANN-accredited registrars
- Maintains full compatibility with global DNS infrastructure
- Domains function identically to traditional domains
- No bridges or workarounds required
- Adheres to all ICANN regulatory requirements

### Key Protocol Modules

#### Tokenization Module
- Signature verification ensures only authorized registrars can tokenize domains
- Prevents unauthorized tokenization
- Mints Domain Ownership Tokens on selected blockchain
- Maintains authoritative records on Doma blockchain

#### Bridging Module
- Enables cross-chain movement of DOTs and DSTs
- Supports all major L1/L2 blockchains
- Maintains consistent domain state across chains
- Ensures ownership and permissions remain synchronized

#### Custodian Module
- Manages ICANN compliance during ownership transfers
- Implements Doma Proxy Registrant system for blockchain-to-DNS translation
- Collects required registrant information via secure off-chain storage
- Coordinates with registrars to complete transfers

#### Composer Module (Fractionalization)
- Converts Domain Ownership Tokens into fungible ERC-20 tokens
- Enables partial ownership and liquidity
- Allows splitting of domain rights into specific permissions
- Powers DeFi primitives like lending, staking, and yield generation

#### Forced Detokenization
- Emergency mechanism for dispute resolution
- Allows controlled burning of all domain tokens across all chains
- Returns full control to registrar for mandated transfers
- Maintains regulatory compliance

---

## Active Features & Capabilities

### 1. Domain Tokenization
- Convert existing domains from 30+ million domain portfolio
- Instant on-chain minting of Domain Ownership Tokens
- Maintains full DNS functionality during and after tokenization
- Works with .com, .ai, .xyz, and all ICANN-approved extensions

### 2. Fractional Ownership (Fractionalization)

**How It Works:**
1. Domain owner locks their domain NFT into the Doma Fractionalization contract
2. Owner defines total token supply (e.g., 10,000 tokens for example.com)
3. Tokens represent the entire ownership of the domain
4. 1-2% protocol fee automatically allocated
5. Remaining tokens distributed via launchpad, public sale, or community rewards
6. Tokens become liquid, tradable assets on DEXs

**Buyback Mechanism:**
- Original owner or any party can initiate buyback
- Must purchase sufficient tokens to meet threshold (typically 90-95%)
- Smart contract verifies ownership threshold
- Upon success, fractional tokens are burned
- Full Domain Ownership Token (NFT) is returned
- Original owner regains complete control

**Use Cases:**
- Domain investors unlock liquidity without full sale
- Crypto users gain exposure to premium domains
- Communities can collectively own brand domains
- DAO governance over domain assets

### 3. 24/7 Trading & Instant Settlement
- Trade domains on decentralized exchanges
- Instant ownership transfers via blockchain
- No escrow delays or broker intermediaries
- Pay with cryptocurrency (USDC, ETH)
- Cross-chain bridging to Base, Solana, Avalanche, ENS

### 4. DeFi Integration
- Use domains as collateral for loans
- Generate yield through liquidity pools
- Stake domain tokens for rewards
- Participate in domain-specific DeFi protocols

### 5. Programmable Rights Management
- Split domain ownership from operational control
- Lease DNS management rights while retaining ownership
- Create time-bound usage rights
- Enable complex permission structures

### 6. Cross-Chain Interoperability

**Supported Networks:**
- Ethereum
- Base
- Solana
- Avalanche
- Ethereum Name Service (ENS)
- Additional networks via LayerZero

Domains can move freely between chains while maintaining their DNS functionality and ownership records.

---

## Doma Names Marketplace on Base

**Launched:** December 18, 2025  
**Platform:** Base App integration  
**Inventory:** 40+ million domains from ICANN-accredited registrars

### Features:
- Embedded directly in the Base App ecosystem
- Browse and purchase premium domains with USDC or ETH
- Instant on-chain settlement
- Portfolio management without leaving Base
- Access to domains from InterNetX, NicNames, EnCirca, Rumahweb, ConnectReseller, and Interstellar registrars

### Significance:
- First major consumer distribution channel for Doma
- Brings Web2 domain supply to Web3-native audience
- "Integrate once, distribute everywhere" model for registrars
- Exposes crypto traders to domain investing

---

## Registrar Partnerships

### InterNetX (Anchor Partner)
- **Portfolio Size:** 22M+ active domains, 24M+ premium listings
- **Network:** 30,000+ global partners
- **Parent Company:** IONOS Group (6.4M customers worldwide)
- **Infrastructure:** Leading European cloud and hosting provider
- **Integration:** Direct API integration for instant on-chain minting

**CEO Statement:** "This partnership with D3 represents our commitment to staying at the cutting edge of digital innovation. By integrating Web3 capabilities like Doma Protocol, we're not just offering our customers new services - we're unlocking new market opportunities." - Elias Rendón Benger

### Additional Registrar Partners:
- **NicNames**
- **EnCirca**
- **Rumahweb**
- **ConnectReseller**
- **Interstellar**

**Combined Reach:** 30+ million domains accessible through Doma

---

## Team & Leadership

### D3 Global Leadership

**Fred Hsu - CEO & Co-Founder**
- 25+ years in domain industry
- Previously co-founded Oversee.net
- Founded Manage.com (acquired by Criteo)
- Founded Ember Entertainment (acquired by Gala Games)
- BS in Computer Science from UCLA

**Paul Stahura - Co-Founder & Advisor**
- Co-founded and led eNom
- Co-founded and led Donuts Inc (world's largest new-gTLD registry)
- BS and MS in Electrical Engineering from Purdue University
- Deep expertise in domain monetization and internet protocols

**Chief Architect & Co-Founder**
- Senior engineering roles at eToys, Oversee.net
- Worked at Bridg (acquired by Cardlytics)
- Experience at dotTV (.tv) and Verisign
- BS in Bioinformatics with Computer Science emphasis from Caltech

**Michael Ho - Chief Business Officer & Co-Founder**
- Former early-stage investor at Presight Capital
- Investment banking at Goldman Sachs SF IBD ($15B+ in tech transactions)
- BA in Business Administration from UC Irvine

**Former VP of Global Strategic Partnerships**
- Previously at GoDaddy
- Chief Revenue Officer at Afternic.com
- Built registrar integration networks powering modern domain aftermarket

**Inder Singh - VP of Product & Technology**
- Leads Doma Forge developer program
- Oversees protocol development and ecosystem integrations

### Team Expertise

The D3 Global team collectively brings:
- **30+ years** of domain industry expertise
- Management of major TLDs: .xyz, .inc, .tv, .link
- Deep relationships with registrars, registries, and ICANN
- Proven track record of successful exits and acquisitions
- Technical expertise in blockchain, DNS, and internet protocols

---

## Doma Forge Developer Program

**Funding:** $1 Million USDC Grant Pool  
**Launch:** June 2025 (with testnet)  
**Website:** doma.xyz/forge

### Program Components

#### 1. Developer Grants
- Funding from ideation to mainnet deployment
- Support for DeFi, digital identity, and payment solutions
- Priority consideration for early applicants

#### 2. Developer-in-Residence Program
- Work alongside Doma core team
- Direct mentorship from technical experts
- Exclusive event access
- Deep protocol integration support

#### 3. Open-Source Tools
- **APIs:** RESTful APIs for domain data access
- **SDKs:** Developer kits for multiple languages
- **Documentation:** Comprehensive technical guides
- **Domain Data:** Access to pricing, history, state changes

#### 4. Community Enablement
- Vibrant network of Web3 builders
- Venture capital partnerships (Paradigm, Coinbase Ventures)
- Collaboration opportunities
- Technical support and resources

#### 5. Ecosystem Integrations
- Pre-built integrations with major chains
- Solana, Base, Avalanche connectivity
- Animecoin, Celestia, Viction partnerships
- Access to new distribution channels

### Grant Recipients
The program has already awarded grants to projects like Var Meta, demonstrating active developer engagement and ecosystem growth.

---

## Ecosystem Partnerships & Integrations

### Blockchain Ecosystems

**LayerZero**
- Canonical interoperability solution
- Enables seamless cross-chain domain transfers
- Connects tokenized domains to entire on-chain economy

**Ethereum Name Service (ENS)**
- Partnership for DNS/ENS integration
- Allows DNS domains to work alongside .eth domains
- Unified resolution across blockchain namespaces

**Solana**
- Partnership for .SOL TLD development
- Solana Record Service integration
- Access to Solana DeFi ecosystem

**Avalanche**
- Partnership for .AVAX TLD launch
- DeFi liquidity integration
- Subnet deployment capabilities

**Base**
- First major distribution channel (Base App)
- Native marketplace integration
- USDC/ETH trading pairs

**Plume**
- Integration with Nest Protocol
- Yield generation capabilities
- RWA-focused DeFi primitives

**Animecoin**
- .anime TLD partnership
- Community-driven domain extensions

### Traditional Partners

**OneFootball**
- Sports domain integration
- Fan engagement use cases

**Hockey.com**
- Premium domain fractionalization
- Sports industry blockchain adoption

---

## Market Performance & Metrics

### Testnet Results (June–November 2025)
- **Transactions:** 35+ million
- **Addresses:** 1.45 million
- **Domains Tokenized:** 200,000+
- **Duration:** 5 months
- **Developer Fund:** $1M USDC allocated

### Mainnet Metrics (as of February 2025)
- **Total Volume:** $38.23M
- **Total Transactions:** 3,257,982
- **Total Tokenized Assets:** 107,519
- **Total Wallets:** 25,564
- **Domain Tokens Launched:** 72
- **Mainnet Blocks:** ~3 million
- **Active Addresses:** 2,700+ at launch

### Market Examples
- **software.ai:** Demonstrated on-chain fractional trading while maintaining DNS resolution
- **yearofthefirehorse.com:** Live on Doma for Lunar New Year 2026
- Multiple domains achieving multi-million dollar FDV (Fully Diluted Valuation)

---

## DomainFi: The New Paradigm

### What is DomainFi?

DomainFi represents the evolution of domains from static web addresses into programmable, financialized assets. It combines:

1. **Domain Scarcity & Identity** - Unique, memorable web addresses
2. **Blockchain Liquidity** - 24/7 tradable markets with instant settlement
3. **Community Ownership** - Fractional ownership and DAO governance
4. **DeFi Primitives** - Lending, staking, yield generation

### The DomainFi Formula

**Domains + Liquidity + Community = DomainFi**

### Key DomainFi Applications

#### Lending & Borrowing
- Use premium domains as collateral
- Access liquidity without selling assets
- Interest rates based on domain valuation

#### Fractionalization
- Break six-figure domains into affordable pieces
- Enable community ownership
- Create liquid markets for illiquid assets

#### Yield Generation
- Earn from domain renewals
- Provide liquidity for trading fees
- Stake tokens for protocol rewards

#### Digital Identity
- On-chain reputation tied to domain ownership
- Wallet resolution via domains
- Unified identity across Web2 and Web3

#### Automated Management
- Smart contract-based renewals
- Programmable DNS updates
- Conditional transfers and leases

---

## Technology Stack

### Blockchain Infrastructure
- **Base Layer:** OP Stack (Optimism)
- **Network Type:** EVM-compatible Layer 2
- **Interoperability:** LayerZero v2
- **Consensus:** Ethereum-secured

### Token Standards
- **DOT:** ERC-20 (ownership representation)
- **DST:** ERC-20 (service control)
- **Fractionalized Tokens:** ERC-20 (fungible ownership shares)

### Smart Contracts
- Tokenization contracts
- Fractionalization contracts
- Bridging contracts
- Custodian contracts
- Record contracts (DNS management)

### APIs & Integrations
- RESTful APIs for registrar integration
- WebSocket APIs for real-time updates
- Domain state synchronization
- Cross-chain messaging via LayerZero
- DNS record management

---

## Competitive Advantages

### 1. Full DNS Compliance
Unlike crypto-native naming systems, Doma domains work with the existing internet infrastructure. No special browsers or plugins required.

### 2. Registrar Partnerships
Direct integration with ICANN-accredited registrars provides instant access to millions of existing domains, not just new registrations.

### 3. Dual-Token Architecture
Separation of ownership (DOT) and functionality (DST) enables sophisticated DeFi primitives while maintaining utility.

### 4. Real-World Asset Class
Domains are digital-native RWAs with:
- No physical custody requirements
- No regulatory licensing complexity
- Built-in utility and cashflow (renewals)
- Established market with 371M+ existing assets

### 5. Cross-Chain by Design
Native interoperability ensures domains aren't locked to a single blockchain ecosystem.

### 6. Experienced Team
Deep domain industry expertise combined with Web3 knowledge creates unique positioning.

---

## Use Cases & Applications

### For Domain Investors
- Unlock liquidity from premium domain portfolios
- Fractional selling without losing entire asset
- Access to crypto-native buyers
- Instant settlement, no escrow delays
- Generate passive income from fractionalized holdings

### For Crypto Traders
- Gain exposure to $360B+ real-world asset class
- Trade domain tokens like any other crypto asset
- Participate in domain token launches
- Diversify beyond purely digital assets
- Speculate on premium domain valuations

### For Developers
- Build DomainFi applications on robust infrastructure
- Access $1M USDC grant pool
- Integrate domain data into DeFi protocols
- Create novel use cases for domain rights
- Leverage existing Web3 tooling

### For Businesses
- Fractionalize corporate domain portfolios
- Raise capital using domain assets
- Create community ownership of brand domains
- Implement DAO governance over digital properties
- Access instant liquidity for domain investments

### For Communities
- Collectively own premium domains
- DAO-governed domain management
- Shared revenue from domain monetization
- Community-driven branding and identity
- Democratic decision-making over domain usage

---

## Future Roadmap & Vision

### New TLD Acquisitions
D3 Global is partnering with blockchains to acquire new ICANN Top-Level Domains:

- **.SOL** (Solana partnership)
- **.AVAX** (Avalanche partnership)
- **.ANIME** (Animecoin partnership)
- **.APE** (ApeCoin collaboration)
- **.SHIB** and other Web3-native extensions

These new TLDs will be natively integrated with Doma from launch, creating millions of new tokenizable domains.

### Expanded DeFi Capabilities
- Advanced lending protocols
- Domain-backed derivatives
- Yield optimization strategies
- Liquidity mining programs
- Cross-chain DeFi composability

### Enhanced Marketplace Features
- Advanced domain discovery tools
- AI-powered domain valuation
- Automated portfolio management
- Social trading features
- Domain analytics and insights

### Broader Ecosystem Integration
- Additional L1/L2 support
- Traditional finance bridges
- Enterprise domain management tools
- Domain-as-a-service platforms
- Web3 wallet integrations

---

## Important Clarifications

### Token Misconceptions

**CRITICAL: There is NO $DOMA token.**

Doma Protocol does not have a native protocol token called $DOMA. The tokenomics are built around:
- **Domain Ownership Tokens (DOTs)** - specific to each domain
- **Domain Service Tokens (DSTs)** - specific to each domain
- **Fractionalized tokens** - named after specific domains (e.g., $SOFTWARE for software.ai)

Any reference to a $DOMA token is incorrect and should not be mentioned or promoted.

### What Doma Is NOT

**Not an alternative namespace:** Doma doesn't create a parallel internet like Handshake or alternative DNS roots.

**Not just for crypto domains:** While it supports Web3 TLDs, the primary value is tokenizing existing traditional domains.

**Not a registrar:** Doma is infrastructure that registrars integrate with, not a competing registrar service.

**Not NFT-only:** While domains can be represented as NFTs, the protocol emphasizes fungible ERC-20 tokens for liquidity.

---

## Key Resources

### Official Links
- **Website:** https://doma.xyz
- **Documentation:** https://docs.doma.xyz
- **Get Started:** https://start.doma.xyz
- **Developer Program:** https://doma.xyz/forge
- **Base Marketplace:** https://base.doma.xyz

### Social & Community
- **Twitter/X:** @domaprotocol
- **Discord:** discord.gg/doma

### Development Resources
- **APIs:** RESTful endpoints for domain data and tokenization
- **SDKs:** Multi-language developer kits
- **Smart Contracts:** Open-source verification and integration
- **Technical Docs:** Comprehensive protocol specification

---

## Summary: Why Doma Protocol Matters

Doma Protocol is revolutionizing the $360+ billion domain industry by solving fundamental problems that have persisted for decades:

### The Innovation
- First DNS-compliant blockchain for domain tokenization
- Dual-token system preserving utility while enabling DeFi
- Direct registrar partnerships for 30M+ domain access
- Full ICANN compliance with Web3 programmability

### The Opportunity
- Transform illiquid domains into 24/7 tradable assets
- Fractional ownership democratizes access to premium domains
- DeFi primitives unlock new revenue streams
- Cross-chain interoperability maximizes market reach

### The Team
- 30+ years domain industry expertise
- Proven track record of successful ventures
- Deep technical and business acumen
- Strong backing from top-tier VCs

### The Ecosystem
- $25M funding from Paradigm and leading investors
- Partnerships with major blockchain ecosystems
- $1M developer grant program driving innovation
- Growing community of builders and domain investors

Doma Protocol represents the convergence of Web2's most fundamental infrastructure with Web3's programmability and liquidity. By making domains programmable, tradable, and accessible, Doma is creating an entirely new asset class and financial ecosystem: **DomainFi**.

---

## Version Information

**Document Version:** 1.0  
**Last Updated:** March 2026  
**Based on Research Through:** February 2026  
**Mainnet Launch:** November 25, 2025  

This guide is intended for educational purposes and to provide comprehensive context about Doma Protocol for content creators, developers, and community members.
