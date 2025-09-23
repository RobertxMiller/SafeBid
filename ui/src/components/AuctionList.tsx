import { useState, useEffect } from 'react'
import { useReadContract, useAccount } from 'wagmi'
import { SAFEBID_CONTRACT_ADDRESS, SAFEBID_ABI, type Auction } from '../utils/contract'

const AuctionList = () => {
  const { address } = useAccount()
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 获取拍卖总数
  const { data: totalAuctions, error: totalError } = useReadContract({
    address: SAFEBID_CONTRACT_ADDRESS as `0x${string}`,
    abi: SAFEBID_ABI,
    functionName: 'getTotalAuctions',
  })

  useEffect(() => {
    const fetchAuctions = async () => {
      if (!totalAuctions || totalError) {
        setError('无法获取拍卖列表')
        setLoading(false)
        return
      }

      try {
        const auctionPromises = []
        const total = Number(totalAuctions)
        
        for (let i = 0; i < total; i++) {
          auctionPromises.push(
            // 这里需要直接调用合约，因为useReadContract不支持动态参数
            fetch(`/api/auction/${i}`).catch(() => null)
          )
        }

        // 由于我们没有API，这里需要改为直接调用合约
        // 这是一个简化版本，实际应用中需要批量读取
        setAuctions([])
        setLoading(false)
      } catch (err: any) {
        setError(err.message || '获取拍卖列表失败')
        setLoading(false)
      }
    }

    fetchAuctions()
  }, [totalAuctions, totalError])

  const formatDate = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleString('zh-CN')
  }

  const formatEth = (wei: bigint) => {
    return (Number(wei) / 10 ** 18).toFixed(4)
  }

  const getAuctionStatus = (auction: Auction) => {
    const now = Date.now() / 1000
    const startTime = Number(auction.startTime)
    const endTime = Number(auction.endTime)

    if (auction.ended) {
      return { text: '已结束', className: 'status-ended' }
    }
    if (!auction.active) {
      return { text: '未激活', className: 'status-inactive' }
    }
    if (now < startTime) {
      return { text: '未开始', className: 'status-inactive' }
    }
    if (now >= startTime && (!endTime || now < endTime)) {
      return { text: '进行中', className: 'status-active' }
    }
    return { text: '未知', className: 'status-inactive' }
  }

  if (loading) {
    return <div className="card">加载中...</div>
  }

  if (error) {
    return <div className="card error">{error}</div>
  }

  if (!totalAuctions || Number(totalAuctions) === 0) {
    return (
      <div className="card">
        <p>暂无拍卖，<a href="#" onClick={() => window.location.reload()}>点击刷新</a>或创建新的拍卖。</p>
      </div>
    )
  }

  return (
    <div>
      <h2>拍卖列表</h2>
      <p>总共 {Number(totalAuctions)} 个拍卖</p>
      
      <div className="grid">
        {auctions.map((auction) => {
          const status = getAuctionStatus(auction)
          const isOwner = address?.toLowerCase() === auction.seller.toLowerCase()
          
          return (
            <div key={Number(auction.id)} className="auction-card">
              <h3>{auction.itemName}</h3>
              <div className={`auction-status ${status.className}`}>
                {status.text}
              </div>
              
              <div style={{ margin: '10px 0' }}>
                <p><strong>拍卖ID:</strong> {Number(auction.id)}</p>
                <p><strong>卖家:</strong> {auction.seller}</p>
                <p><strong>起拍价:</strong> {formatEth(auction.startPrice)} ETH</p>
                <p><strong>开拍时间:</strong> {formatDate(auction.startTime)}</p>
                
                {auction.ended && (
                  <>
                    <p><strong>结束时间:</strong> {formatDate(auction.endTime)}</p>
                    {auction.winner !== '0x0000000000000000000000000000000000000000' && (
                      <>
                        <p><strong>获胜者:</strong> {auction.winner}</p>
                        <p><strong>成交价:</strong> {formatEth(auction.finalPrice)} ETH</p>
                      </>
                    )}
                  </>
                )}
              </div>

              <div style={{ marginTop: '15px' }}>
                {isOwner && (
                  <span style={{ 
                    background: '#333', 
                    color: '#fff', 
                    padding: '4px 8px', 
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    我的拍卖
                  </span>
                )}
                
                {!auction.ended && status.text === '进行中' && !isOwner && (
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      // 切换到竞拍页面，并设置拍卖ID
                      // 这里需要与App组件通信
                      console.log('参与竞拍', auction.id)
                    }}
                  >
                    参与竞拍
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button 
          className="btn btn-secondary" 
          onClick={() => window.location.reload()}
        >
          刷新列表
        </button>
      </div>
    </div>
  )
}

export default AuctionList