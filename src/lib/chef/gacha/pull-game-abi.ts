// Subset of the verified PullGame ABI supplied via the Doma explorer, reviewed
// 2026-10-05 at 0xF4B1eB75526f35BF8aD98B97bBF980CD6cbE1127. This is a protocol
// reference, NOT a configured Domain Kitchen deployment address.
export const pullGameAbi = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "roundId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "secret",
        "type": "bytes32"
      }
    ],
    "name": "revealRound",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "prizeTokenAmount",
        "type": "uint256"
      }
    ],
    "name": "CardBurned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "roundId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "boxId",
        "type": "uint256"
      },
      {
        "components": [
          {
            "components": [
              {
                "internalType": "bytes32",
                "name": "boxConfigsHash",
                "type": "bytes32"
              },
              {
                "internalType": "bytes32",
                "name": "randomness",
                "type": "bytes32"
              },
              {
                "internalType": "bytes32",
                "name": "roundHash",
                "type": "bytes32"
              },
              {
                "internalType": "bytes32",
                "name": "roundSecretKeyHash",
                "type": "bytes32"
              },
              {
                "internalType": "bytes32",
                "name": "pullTxHash",
                "type": "bytes32"
              },
              {
                "internalType": "bytes32",
                "name": "pullNextBlockHash",
                "type": "bytes32"
              },
              {
                "internalType": "uint256",
                "name": "pullNextBlockTimestamp",
                "type": "uint256"
              }
            ],
            "internalType": "struct PullGame.RandomnessSource",
            "name": "randomnessSource",
            "type": "tuple"
          },
          {
            "internalType": "uint8",
            "name": "cardNumber",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "prizeAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "prizeTokenAmount",
            "type": "uint256"
          }
        ],
        "indexed": false,
        "internalType": "struct PullGame.PullResult",
        "name": "result",
        "type": "tuple"
      }
    ],
    "name": "PullFulfilled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "PullRefunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "PullRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "roundId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "secretKeyHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "secret",
        "type": "bytes32"
      }
    ],
    "name": "RoundRevealed",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "boxConfigsHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "randomness",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "roundHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "roundSecretKeyHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "pullTxHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "pullNextBlockHash",
            "type": "bytes32"
          },
          {
            "internalType": "uint256",
            "name": "pullNextBlockTimestamp",
            "type": "uint256"
          }
        ],
        "internalType": "struct PullGame.RandomnessSource",
        "name": "randomnessSource",
        "type": "tuple"
      },
      {
        "internalType": "uint256",
        "name": "roundId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "boxId",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "cardNumber",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "prizeAmount",
        "type": "uint256"
      }
    ],
    "name": "fulfill",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      }
    ],
    "name": "getPull",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "player",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "blockNumber",
            "type": "uint64"
          },
          {
            "internalType": "enum PullGame.PullStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "price",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "commitmentHash",
            "type": "bytes32"
          }
        ],
        "internalType": "struct PullGame.Pull",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      }
    ],
    "name": "refund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "refundTimeoutBlocks",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
