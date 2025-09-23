import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { SAFEBID_CONTRACT_ADDRESS, SAFEBID_ABI } from '../utils/contract'
import { useFhevm } from '../hooks/useFhevm'

const PlaceBid = () => {
  const { address } = useAccount()
  const { instance: fhevmInstance, loading: fhevmLoading, error: fhevmError } = useFhevm()
  const [auctionId, setAuctionId] = useState('')
  const [bidAmount, setBidAmount] = useState('')
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

    if (!fhevmInstance) {
      setError('FHEVM 未初始化')
      return
    }

    if (!auctionId || !bidAmount) {
      setError('请填写所有字段')
      return
    }

    setLoading(true)

    try {
      // 将出价金额转换为wei（32位整数范围内）
      const bidInWei = Math.floor(parseFloat(bidAmount) * 10 ** 18)
      
      // 检查金额是否在32位整数范围内
      if (bidInWei > 2 ** 32 - 1) {
        throw new Error('出价金额过大，请输入较小的金额')
      }

      // 创建加密输入
      const input = fhevmInstance.createEncryptedInput(
        SAFEBID_CONTRACT_ADDRESS,
        address
      )
      
      input.add32(bidInWei)
      const encryptedInput = await input.encrypt()

      await writeContract({
        address: SAFEBID_CONTRACT_ADDRESS as `0x${string}`,
        abi: SAFEBID_ABI,
        functionName: 'placeBid',
        args: [
          BigInt(auctionId),
          encryptedInput.handles[0],
          encryptedInput.inputProof
        ],
      })

      setSuccess('出价提交成功！您的出价金额已加密提交。')
      // 重置表单
      setAuctionId('')
      setBidAmount('')
    } catch (err: any) {
      console.error('Bid error:', err)
      setError(err.message || '出价失败')
    } finally {
      setLoading(false)
    }
  }

  if (fhevmLoading) {
    return <div className="card">初始化加密系统中...</div>
  }

  if (fhevmError) {
    return <div className="card error">加密系统初始化失败: {fhevmError}</div>
  }

  return (
    <div className="card">
      <h2>参与竞拍</h2>
      <p>使用Zama FHE技术，您的出价金额将完全保密，其他用户无法看到您的具体出价。</p>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="auctionId">拍卖ID：</label>
          <input
            type="number"
            id="auctionId"
            value={auctionId}
            onChange={(e) => setAuctionId(e.target.value)}
            placeholder="输入要参与的拍卖ID"
            min="0"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="bidAmount">出价金额 (ETH)：</label>
          <input
            type="number"
            id="bidAmount"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder="输入您的出价"
            step="0.001"
            min="0"
            max="4.294" // 约4.3 ETH (2^32 wei的上限)
            required
          />
          <small style={{ color: '#888' }}>
            注意：由于加密限制，单次出价不能超过约4.3 ETH
          </small>
        </div>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        {isConfirming && <div className="success">交易确认中...</div>}
        {isConfirmed && <div className="success">出价成功！</div>}

        <button
          type="submit"
          className="btn btn-success"
          disabled={loading || isConfirming || !address || !fhevmInstance}
        >
          {loading || isConfirming ? '提交中...' : '加密出价'}
        </button>
      </form>

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#888' }}>
        <p><strong>隐私保护：</strong></p>
        <ul style={{ textAlign: 'left' }}>
          <li>您的出价金额使用Zama FHE技术完全加密</li>
          <li>其他参与者无法看到您的具体出价</li>
          <li>只有在拍卖结束后，获胜者才会被公布</li>
          <li>整个过程在链上进行，保证公平透明</li>
        </ul>
        
        <p><strong>注意事项：</strong></p>
        <ul style={{ textAlign: 'left' }}>
          <li>确认拍卖仍在进行中</li>
          <li>您的出价应高于起拍价</li>
          <li>成功出价后无法撤回</li>
          <li>如果获胜，您需要支付ETH完成购买</li>
        </ul>
      </div>
    </div>
  )
}

export default PlaceBid