-- ============================================================
--  Web3Guides — Seed Data
--  Provides one sample guide per subdomain for local development
-- ============================================================

insert into guides
  (subdomain, title, summary, difficulty, tags, source_url, slug, read_time_minutes, author, published_at)
values

-- eth
('eth', 'How Ethereum Proof-of-Stake Works', 'A complete walkthrough of Ethereum''s transition from Proof-of-Work to Proof-of-Stake via The Merge, covering validators, attestations, and finality.', 'intermediate', ARRAY['pos','validators','the-merge','consensus'], 'https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/', 'how-ethereum-pos-works', 12, 'Ethereum Foundation', '2024-01-10T10:00:00Z'),

('eth', 'Understanding EIP-1559 Fee Market', 'Deep dive into EIP-1559: base fee, priority fee, fee burning, and how it changed Ethereum''s tokenomics forever.', 'advanced', ARRAY['eip-1559','gas','tokenomics','fees'], 'https://eips.ethereum.org/EIPS/eip-1559', 'understanding-eip-1559', 18, 'Tim Beiko', '2024-02-14T09:00:00Z'),

-- sol
('sol', 'Solana Architecture Explained', 'Understand Proof of History, Tower BFT, Turbine, and the other innovations that let Solana process 65,000+ TPS.', 'intermediate', ARRAY['poh','architecture','consensus','tps'], 'https://docs.solana.com/cluster/overview', 'solana-architecture-explained', 15, 'Solana Labs', '2024-01-22T08:00:00Z'),

('sol', 'Building Your First Solana Program with Anchor', 'Step-by-step tutorial for writing, testing, and deploying a Solana smart contract (program) using the Anchor framework.', 'beginner', ARRAY['anchor','programs','rust','tutorial'], 'https://www.anchor-lang.com/docs/getting-started', 'first-solana-program-anchor', 25, 'Coral Dev', '2024-03-01T12:00:00Z'),

-- btc
('btc', 'Bitcoin Script: How Transactions Are Locked', 'Explore Bitcoin''s stack-based scripting language, P2PKH, P2SH, P2WPKH, and Taproot scripts in plain English.', 'advanced', ARRAY['script','taproot','transactions','p2pkh'], 'https://learnmeabitcoin.com/technical/script', 'bitcoin-script-explained', 20, 'Learn Me a Bitcoin', '2024-01-05T07:00:00Z'),

('btc', 'Setting Up a Bitcoin Lightning Node', 'How to install LND or CLN, open channels, manage liquidity, and start routing payments on the Lightning Network.', 'intermediate', ARRAY['lightning','lnd','node','payments'], 'https://docs.lightning.engineering/', 'bitcoin-lightning-node-setup', 30, 'Lightning Engineering', '2024-02-28T11:00:00Z'),

-- defi
('defi', 'How Uniswap V3 Concentrated Liquidity Works', 'An in-depth explanation of Uniswap V3''s concentrated liquidity positions, tick math, and impermanent loss implications.', 'advanced', ARRAY['uniswap','amm','liquidity','concentrated'], 'https://uniswap.org/whitepaper-v3.pdf', 'uniswap-v3-concentrated-liquidity', 22, 'Uniswap Labs', '2024-01-18T14:00:00Z'),

('defi', 'DeFi Lending Protocols: Aave vs Compound', 'Compare how Aave and Compound handle interest rate models, collateral factors, liquidations, and governance.', 'intermediate', ARRAY['aave','compound','lending','liquidations'], 'https://docs.aave.com/hub/', 'aave-vs-compound-lending', 16, 'DeFi Pulse', '2024-03-10T09:00:00Z'),

-- staking
('staking', 'Liquid Staking Derivatives: stETH, rETH, cbETH Compared', 'A comprehensive comparison of the largest liquid staking tokens: mechanics, risks, yields, and DeFi integrations.', 'intermediate', ARRAY['lsd','lido','rocketpool','liquid-staking'], 'https://research.lido.fi/', 'liquid-staking-derivatives-compared', 14, 'Lido Research', '2024-02-05T10:00:00Z'),

('staking', 'How to Run an Ethereum Validator on Your Own Hardware', 'Step-by-step guide to solo staking 32 ETH: hardware requirements, client diversity, key management, and MEV-Boost.', 'advanced', ARRAY['validator','solo-staking','hardware','mev-boost'], 'https://ethereum.org/en/staking/solo/', 'run-ethereum-validator-hardware', 35, 'EthStaker', '2024-01-30T08:00:00Z'),

-- layer2
('layer2', 'Optimistic vs ZK Rollups: The Full Comparison', 'How optimistic rollups (Arbitrum, Optimism) and ZK rollups (zkSync, Starknet, Scroll) differ in proofs, costs, and trust assumptions.', 'intermediate', ARRAY['rollups','zk-proofs','optimistic','scaling'], 'https://ethereum.org/en/layer-2/', 'optimistic-vs-zk-rollups', 18, 'L2Beat', '2024-02-20T13:00:00Z'),

('layer2', 'Arbitrum Nitro Deep Dive', 'Technical breakdown of Arbitrum Nitro''s WASM-based fraud proofs, sequencer design, and the differences from the original AVM.', 'advanced', ARRAY['arbitrum','nitro','fraud-proofs','sequencer'], 'https://developer.arbitrum.io/inside-arbitrum-nitro/', 'arbitrum-nitro-deep-dive', 28, 'Offchain Labs', '2024-03-05T09:00:00Z'),

-- bridge
('bridge', 'Cross-Chain Bridges: Risks and Architecture', 'Why bridges are the most exploited category in crypto, how lock-and-mint vs liquidity-pool bridges work, and how to assess bridge risk.', 'intermediate', ARRAY['bridges','security','cross-chain','hacks'], 'https://blog.li.fi/what-are-blockchain-bridges-and-how-can-we-classify-them-560dc6ec05fa', 'cross-chain-bridge-risks-architecture', 20, 'LI.FI', '2024-01-25T11:00:00Z'),

-- rwa
('rwa', 'Tokenised US Treasuries: How They Work On-Chain', 'How projects like Ondo Finance and Franklin Templeton bring short-duration T-bill exposure on-chain, and the regulatory considerations.', 'intermediate', ARRAY['rwa','tokenization','treasuries','ondo'], 'https://ondo.finance/ousg', 'tokenised-us-treasuries-on-chain', 15, 'Ondo Finance', '2024-02-12T10:00:00Z'),

-- legal
('legal', 'DAO Legal Wrappers: Wyoming DAO LLC vs Marshall Islands', 'A practical guide to incorporating your DAO with legal personality, comparing the two most popular jurisdictions, their liability protection, and governance requirements.', 'intermediate', ARRAY['dao','legal-wrapper','wyoming','compliance'], 'https://a16zcrypto.com/posts/article/dao-legal-frameworks/', 'dao-legal-wrappers-compared', 17, 'a16z Crypto', '2024-01-14T09:00:00Z'),

-- tax
('tax', 'DeFi Tax Events: What Triggers a Taxable Event?', 'A comprehensive breakdown of which DeFi activities are taxable in the US: swaps, liquidity provision, staking rewards, airdrops, and NFT trades.', 'intermediate', ARRAY['tax','defi','irs','capital-gains'], 'https://tokentax.co/guides/defi-taxes', 'defi-tax-events-guide', 19, 'TokenTax', '2024-02-08T08:00:00Z'),

-- security
('security', 'The Ultimate Crypto Wallet Security Guide', 'Hardware wallets, seed phrase storage, multisig setup, and operational security practices to protect your on-chain assets from every threat vector.', 'beginner', ARRAY['security','hardware-wallet','seed-phrase','opsec'], 'https://blog.trailofbits.com/2018/11/27/10-rules-for-the-secure-use-of-cryptocurrency-hardware-wallets/', 'ultimate-crypto-wallet-security', 22, 'Trail of Bits', '2024-01-08T10:00:00Z'),

-- easy
('easy', 'What Is a Blockchain? Explained Like You''re 10', 'A zero-jargon explainer of what blockchains are, why they''re tamper-resistant, and what problem they actually solve — with real-world analogies.', 'beginner', ARRAY['basics','blockchain','explainer','web3'], 'https://www.coinbase.com/learn/crypto-basics/what-is-a-blockchain', 'what-is-a-blockchain-explained', 8, 'Coinbase Learn', '2024-03-01T10:00:00Z'),

-- beginner
('beginner', 'How to Buy Your First Crypto Safely', 'Everything a complete beginner needs to know: choosing a reputable exchange, KYC, buying BTC/ETH, and withdrawing to your own wallet.', 'beginner', ARRAY['getting-started','exchange','buy-crypto','self-custody'], 'https://www.coinbase.com/learn/getting-started', 'how-to-buy-first-crypto', 12, 'Coinbase', '2024-01-02T09:00:00Z'),

-- bigmike
('bigmike', 'Big Mike''s 2024 Crypto Market Structure Breakdown', 'Mike breaks down the macro backdrop for crypto in 2024: Fed rate cycles, BTC halving impact, altcoin season timing, and where he sees the big opportunities.', 'intermediate', ARRAY['macro','market-structure','halving','alpha'], 'https://web3guides.com/bigmike/2024-market-structure', 'big-mike-2024-market-structure', 20, 'Big Mike', '2024-01-15T15:00:00Z')

on conflict (subdomain, slug) do nothing;
