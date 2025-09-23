import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { SAFEBID_CONTRACT_ADDRESS, SAFEBID_ABI } from '../utils/contract'

const CreateAuction = () => {
  const { address } = useAccount()
  const [itemName, setItemName] = useState('')
  const [startPrice, setStartPrice] = useState('')
  const [startTime, setStartTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { writeContract, data: hash } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      if (!itemName || !startPrice || !startTime) {
        throw new Error('请填写所有字段')
      }

      const priceInWei = BigInt(startPrice) * BigInt(10 ** 18) // 转换为wei
      const startTimeUnix = new Date(startTime).getTime() / 1000

      if (startTimeUnix <= Date.now() / 1000) {
        throw new Error('开拍时间必须在未来')
      }

      await writeContract({
        address: SAFEBID_CONTRACT_ADDRESS as `0x${string}`,
        abi: SAFEBID_ABI,
        functionName: 'createAuction',
        args: [itemName, priceInWei, BigInt(Math.floor(startTimeUnix))],
      })

      setSuccess('拍卖创建成功！')
      // 重置表单
      setItemName('')
      setStartPrice('')
      setStartTime('')
    } catch (err: any) {
      setError(err.message || '创建拍卖失败')
    } finally {
      setLoading(false)
    }
  }

  const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // 设置默认时间为1小时后
  const defaultStartTime = formatDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000))

  return (
    <div className="card">
      <h2>创建新拍卖</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="itemName">物品名称：</label>
          <input
            type="text"
            id="itemName"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="输入拍卖物品名称"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="startPrice">起拍价格 (ETH)：</label>
          <input
            type="number"
            id="startPrice"
            value={startPrice}
            onChange={(e) => setStartPrice(e.target.value)}
            placeholder="0.1"
            step="0.001"
            min="0"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="startTime">开拍时间：</label>
          <input
            type="datetime-local"
            id="startTime"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            min={formatDateTimeLocal(new Date())}
            defaultValue={defaultStartTime}
            required
          />
        </div>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        {isConfirming && <div className="success">交易确认中...</div>}
        {isConfirmed && <div className="success">拍卖创建成功！</div>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || isConfirming || !address}
        >
          {loading || isConfirming ? '创建中...' : '创建拍卖'}
        </button>
      </form>

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#888' }}>
        <p><strong>使用说明：</strong></p>
        <ul style={{ textAlign: 'left' }}>
          <li>设定物品名称和起拍价格</li>
          <li>选择开拍时间（必须在未来）</li>
          <li>拍卖开始后，买家可以进行保密出价</li>
          <li>1分钟内无人出价则拍卖结束</li>
          <li>最高价者获得拍品</li>
        </ul>
      </div>
    </div>
  )
}

export default CreateAuction