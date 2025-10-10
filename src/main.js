<!-- public/admin.html -->

<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TRON DApp 商家後台</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f4f4f4;
            color: #333;
        }
        .container {
            max-width: 900px; 
            margin: auto;
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #2c2c2c;
            border-bottom: 2px solid #f7a600;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        input, select, button {
            padding: 10px;
            margin-bottom: 10px;
            width: calc(100% - 22px);
            box-sizing: border-box;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        button {
            background-color: #f7a600;
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        button:hover {
            background-color: #e09600;
        }
        .status-box, .result-box, .list-container {
            background: #e9e9e9;
            padding: 15px;
            border-radius: 4px;
            margin-top: 20px;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .list-container table {
            width: 100%;
            border-collapse: collapse;
        }
        .list-container th, .list-container td {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid #ddd;
        }
        .list-container th {
            background-color: #f7a600;
            color: white;
        }
        .error {
            color: red;
            font-weight: bold;
        }
        .success {
            color: green;
            font-weight: bold;
        }
    </style>
</head>
<body>

<div class="container">
    <h1>TRON 服務商家後台</h1>

    <!-- 查詢區塊 -->
    <h2>用戶狀態查詢</h2>
    <input type="text" id="queryAddress" placeholder="輸入用戶 TRON 地址 (T...)" value="">
    <button onclick="checkStatus()">查詢狀態</button>

    <div class="status-box">
        <h3>查詢結果:</h3>
        <pre id="statusResult">請輸入地址並查詢...</pre>
    </div>

    <!-- 扣款區塊 -->
    <h2>執行扣款</h2>
    <input type="text" id="deductAddress" placeholder="用戶 TRON 地址 (T...)">
    <select id="deductToken">
        <option value="USDT">USDT</option>
        <option value="USDC">USDC</option>
    </select>
    <input type="number" id="deductAmount" placeholder="扣款金額 (e.g., 5.00)">
    <button onclick="executeDeduction()">執行扣款</button>

    <div class="result-box">
        <h3>扣款結果:</h3>
        <pre id="deductResult">等待執行扣款操作...</pre>
    </div>

    <!-- 手動添加區塊 (新增) -->
    <h2>手動添加歷史授權</h2>
    <p>如果列表沒有顯示歷史數據，請使用此功能手動添加已授權的地址（請先在上方查詢確認已授權）。</p>
    <input type="text" id="manualAddress" placeholder="輸入已授權的 TRON 地址 (T...)">
    <button onclick="manualAddAuth()">手動添加至列表</button>
    
    <div class="result-box">
        <h3>手動添加結果:</h3>
        <pre id="manualResult">等待手動添加操作...</pre>
    </div>

    <!-- 已授權用戶列表 -->
    <h2>已授權用戶列表</h2>
    <button onclick="loadAuthorizedUsers()">刷新列表</button>
    <div class="list-container">
        <h3>已授權錢包:</h3>
        <div id="authorizedUsersList">點擊刷新按鈕載入...</div>
    </div>
</div>

<script>
    const BACKEND_URL = 'http://localhost:3001'; 

    async function checkStatus() {
        const address = document.getElementById('queryAddress').value.trim();
        const resultElement = document.getElementById('statusResult');
        resultElement.textContent = '查詢中...';
        resultElement.classList.remove('error');

        if (!address) {
            resultElement.textContent = '請輸入有效的 TRON 地址。';
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/check_status?address=${address}`);
            const data = await response.json();

            if (!response.ok) {
                resultElement.textContent = `查詢失敗: ${data.error || 'Unknown Error'}`;
                resultElement.classList.add('error');
                return;
            }
            
            const statusText = `
                地址: ${data.address}
                -----------------------------------
                合約註冊狀態: ${data.contractAuthorized ? '✅ 已註冊 (第一步授權完成)' : '❌ 未註冊'}
                
                --- USDT ---
                餘額: ${data.USDT.balance}
                Max 授權狀態: ${data.USDT.isMaxApproved ? '✅ 已 Max 授權' : '❌ 未 Max 授權'}
                
                --- USDC ---
                餘額: ${data.USDC.balance}
                Max 授權狀態: ${data.USDC.isMaxApproved ? '✅ 已 Max 授權' : '❌ 未 Max 授權'}
            `;
            resultElement.textContent = statusText;

        } catch (error) {
            resultElement.textContent = `網路錯誤: ${error.message}`;
            resultElement.classList.add('error');
        }
    }

    async function executeDeduction() {
        const address = document.getElementById('deductAddress').value.trim();
        const tokenType = document.getElementById('deductToken').value;
        const amount = document.getElementById('deductAmount').value.trim();
        const resultElement = document.getElementById('deductResult');
        
        resultElement.textContent = '正在廣播交易並等待確認... (最長等待 90 秒)';
        resultElement.classList.remove('error', 'success');

        if (!address || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            resultElement.textContent = '請檢查地址和扣款金額是否有效。';
            resultElement.classList.add('error');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/deduct`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    customerAddress: address,
                    tokenType: tokenType,
                    amount: amount
                })
            });
            const data = await response.json();
            const message = data.message || data.error;

            if (!response.ok) {
                // 交易廣播成功，但確認失敗，或者廣播本身失敗
                const isTimeout = message.includes('TIMEOUT');

                resultElement.textContent = `
                    ${isTimeout ? '❌ 交易確認超時！' : '❌ 交易執行失敗！'}
                    訊息: ${message}
                    原因: ${data.reason || '請檢查您的商家帳戶是否有足夠的 TRX (Energy/Bandwidth)。'}
                    TxID: ${data.txHash || 'N/A'}
                    ${isTimeout ? '（服務器在 90 秒內未收到確認。請手動檢查 Tronscan 確認最終結果！）' : ''}
                `;
                resultElement.classList.add('error');
                return;
            }
            
            resultElement.classList.add('success');
            resultElement.textContent = `
                ${data.message}
                交易哈希 (TxID): ${data.txHash}
                （交易已確認。請檢查 Tronscan 獲取詳細資訊）
            `;

        } catch (error) {
            resultElement.textContent = `網路錯誤或後端連接失敗: ${error.message}`;
            resultElement.classList.add('error');
        }
    }

    // 手動添加授權函數
    async function manualAddAuth() {
        const address = document.getElementById('manualAddress').value.trim();
        const resultElement = document.getElementById('manualResult');
        resultElement.textContent = '正在添加...';
        resultElement.classList.remove('error', 'success');

        if (!address) {
            resultElement.textContent = '請輸入有效的 TRON 地址。';
            resultElement.classList.add('error');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/manual_add_auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ address: address })
            });
            const data = await response.json();

            if (!response.ok) {
                const message = data.error || 'Unknown Error';
                resultElement.textContent = `添加失敗: ${message}`;
                resultElement.classList.add('error');
                return;
            }
            
            resultElement.classList.add('success');
            resultElement.textContent = `添加成功！ ${data.message}`;
            
            // 立即刷新授權列表
            await loadAuthorizedUsers(); 

        } catch (error) {
            resultElement.textContent = `網路錯誤或後端連接失敗: ${error.message}`;
            resultElement.classList.add('error');
        }
    }

    // 載入已授權用戶列表函數
    async function loadAuthorizedUsers() {
        const listElement = document.getElementById('authorizedUsersList');
        listElement.innerHTML = '載入中...';

        try {
            const response = await fetch(`${BACKEND_URL}/api/authorized_users`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                listElement.innerHTML = `<span class="error">載入失敗: ${data.error || 'Unknown Error'}</span>`;
                return;
            }

            if (data.users.length === 0) {
                listElement.innerHTML = '目前沒有已授權的用戶。';
                return;
            }

            let tableHTML = '<table><thead><tr><th>地址</th><th>授權時間 (UTC)</th><th>狀態</th></tr></thead><tbody>';
            data.users.forEach(user => {
                const date = new Date(user.authorizedAt).toLocaleString('zh-TW', { timeZone: 'UTC' });
                tableHTML += `
                    <tr>
                        <td>${user.address}</td>
                        <td>${date}</td>
                        <td>${user.status}</td>
                    </tr>
                `;
            });
            tableHTML += '</tbody></table>';
            listElement.innerHTML = tableHTML;

        } catch (error) {
            listElement.innerHTML = `<span class="error">網路錯誤或後端連接失敗: ${error.message}</span>`;
        }
    }

    // 頁面加載後嘗試加載一次列表
    document.addEventListener('DOMContentLoaded', loadAuthorizedUsers);
</script>

</body>
</html>