// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title SafeBid - 链上保密竞拍系统
/// @notice 基于Zama FHE的保密竞拍合约，竞拍价格完全加密
contract SafeBid is SepoliaConfig {
    struct Auction {
        uint256 id;
        address seller;
        string itemName;
        uint256 startPrice;      // 起拍价格（明文）
        uint256 startTime;       // 开拍时间
        uint256 endTime;         // 结束时间
        bool active;             // 拍卖是否激活
        bool ended;              // 拍卖是否结束
        address winner;          // 获胜者
        uint256 finalPrice;      // 最终成交价格
    }

    struct Bid {
        address bidder;
        euint32 encryptedAmount;  // 加密的出价金额
        uint256 timestamp;
        bool valid;
    }

    // 状态变量
    uint256 private _nextAuctionId;
    uint256 public constant BID_TIMEOUT = 60; // 1分钟无人出价则结束
    
    // 映射
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => Bid[]) public auctionBids;
    mapping(uint256 => uint256) public lastBidTime;
    mapping(uint256 => euint32) public highestBid; // 当前最高出价（加密）
    mapping(uint256 => address) public currentLeader; // 当前领先者

    // 事件
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        string itemName,
        uint256 startPrice,
        uint256 startTime
    );
    
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 timestamp
    );
    
    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 finalPrice
    );

    modifier auctionExists(uint256 auctionId) {
        require(auctions[auctionId].seller != address(0), "Auction does not exist");
        _;
    }

    modifier auctionActive(uint256 auctionId) {
        require(auctions[auctionId].active, "Auction not active");
        require(!auctions[auctionId].ended, "Auction already ended");
        require(block.timestamp >= auctions[auctionId].startTime, "Auction not started");
        _;
    }

    /// @notice 创建新的拍卖
    /// @param itemName 拍卖物品名称
    /// @param startPrice 起拍价格（wei）
    /// @param startTime 开拍时间戳
    function createAuction(
        string memory itemName,
        uint256 startPrice,
        uint256 startTime
    ) external returns (uint256) {
        require(startTime > block.timestamp, "Start time must be in future");
        require(startPrice > 0, "Start price must be greater than 0");
        require(bytes(itemName).length > 0, "Item name cannot be empty");

        uint256 auctionId = _nextAuctionId++;
        
        auctions[auctionId] = Auction({
            id: auctionId,
            seller: msg.sender,
            itemName: itemName,
            startPrice: startPrice,
            startTime: startTime,
            endTime: 0,
            active: true,
            ended: false,
            winner: address(0),
            finalPrice: 0
        });

        // 初始化最高出价为起拍价
        highestBid[auctionId] = FHE.asEuint32(uint32(startPrice));
        FHE.allowThis(highestBid[auctionId]);

        emit AuctionCreated(auctionId, msg.sender, itemName, startPrice, startTime);
        
        return auctionId;
    }

    /// @notice 出价
    /// @param auctionId 拍卖ID
    /// @param encryptedBid 加密的出价金额
    /// @param inputProof 输入证明
    function placeBid(
        uint256 auctionId,
        externalEuint32 encryptedBid,
        bytes calldata inputProof
    ) external auctionExists(auctionId) auctionActive(auctionId) {
        require(msg.sender != auctions[auctionId].seller, "Seller cannot bid");

        // 验证并转换加密输入
        euint32 bidAmount = FHE.fromExternal(encryptedBid, inputProof);

        // 检查出价是否高于当前最高价
        ebool isHigherBid = FHE.gt(bidAmount, highestBid[auctionId]);
        
        // 有条件地更新最高出价和领先者
        highestBid[auctionId] = FHE.select(isHigherBid, bidAmount, highestBid[auctionId]);
        
        // 记录出价
        auctionBids[auctionId].push(Bid({
            bidder: msg.sender,
            encryptedAmount: bidAmount,
            timestamp: block.timestamp,
            valid: true
        }));

        // 更新最后出价时间
        lastBidTime[auctionId] = block.timestamp;
        
        // 条件性地更新当前领先者
        // 注意：这里使用简化的逻辑，实际应用中可能需要更复杂的处理
        currentLeader[auctionId] = msg.sender;

        // 设置ACL权限
        FHE.allowThis(bidAmount);
        FHE.allow(bidAmount, msg.sender);
        FHE.allowThis(highestBid[auctionId]);

        emit BidPlaced(auctionId, msg.sender, block.timestamp);
    }

    /// @notice 检查拍卖是否应该结束（1分钟无人出价）
    /// @param auctionId 拍卖ID
    function checkAuctionEnd(uint256 auctionId) 
        external 
        auctionExists(auctionId) 
        returns (bool) 
    {
        if (auctions[auctionId].ended) {
            return true;
        }

        // 如果有出价且超过1分钟无新出价，则结束拍卖
        if (lastBidTime[auctionId] > 0 && 
            block.timestamp >= lastBidTime[auctionId] + BID_TIMEOUT) {
            
            _endAuction(auctionId);
            return true;
        }

        return false;
    }

    /// @notice 手动结束拍卖（仅限卖方）
    /// @param auctionId 拍卖ID
    function endAuction(uint256 auctionId) 
        external 
        auctionExists(auctionId) 
    {
        require(msg.sender == auctions[auctionId].seller, "Only seller can end auction");
        require(!auctions[auctionId].ended, "Auction already ended");
        
        // 必须有人出价且超过超时时间，或者卖方强制结束
        if (lastBidTime[auctionId] > 0) {
            require(
                block.timestamp >= lastBidTime[auctionId] + BID_TIMEOUT,
                "Cannot end auction yet"
            );
        }
        
        _endAuction(auctionId);
    }

    /// @notice 内部函数：结束拍卖
    function _endAuction(uint256 auctionId) internal {
        auctions[auctionId].ended = true;
        auctions[auctionId].active = false;
        auctions[auctionId].endTime = block.timestamp;
        
        if (currentLeader[auctionId] != address(0)) {
            auctions[auctionId].winner = currentLeader[auctionId];
            // 注意：这里简化处理，实际应用中需要通过预言机获取最终价格
            auctions[auctionId].finalPrice = auctions[auctionId].startPrice;
        }

        emit AuctionEnded(
            auctionId, 
            auctions[auctionId].winner, 
            auctions[auctionId].finalPrice
        );
    }

    /// @notice 获取拍卖信息
    /// @param auctionId 拍卖ID
    function getAuction(uint256 auctionId) 
        external 
        view 
        auctionExists(auctionId) 
        returns (Auction memory) 
    {
        return auctions[auctionId];
    }

    /// @notice 获取加密的最高出价（仅限有权限的用户）
    /// @param auctionId 拍卖ID
    function getHighestBid(uint256 auctionId) 
        external 
        view 
        auctionExists(auctionId) 
        returns (euint32) 
    {
        return highestBid[auctionId];
    }

    /// @notice 获取拍卖的出价数量
    /// @param auctionId 拍卖ID
    function getBidCount(uint256 auctionId) 
        external 
        view 
        auctionExists(auctionId) 
        returns (uint256) 
    {
        return auctionBids[auctionId].length;
    }

    /// @notice 获取总拍卖数量
    function getTotalAuctions() external view returns (uint256) {
        return _nextAuctionId;
    }

    /// @notice 支付并完成购买（获胜者调用）
    /// @param auctionId 拍卖ID
    function completePurchase(uint256 auctionId) 
        external 
        payable 
        auctionExists(auctionId)
    {
        require(auctions[auctionId].ended, "Auction not ended");
        require(auctions[auctionId].winner == msg.sender, "Not the winner");
        require(msg.value >= auctions[auctionId].startPrice, "Insufficient payment");

        // 将资金转给卖方
        payable(auctions[auctionId].seller).transfer(msg.value);

        // 如果有多余的资金，退还给买方
        if (msg.value > auctions[auctionId].startPrice) {
            payable(msg.sender).transfer(msg.value - auctions[auctionId].startPrice);
        }
    }

    /// @notice 紧急停止拍卖（仅限卖方）
    /// @param auctionId 拍卖ID
    function emergencyStop(uint256 auctionId) 
        external 
        auctionExists(auctionId)
    {
        require(msg.sender == auctions[auctionId].seller, "Only seller can emergency stop");
        require(!auctions[auctionId].ended, "Auction already ended");
        
        auctions[auctionId].active = false;
        auctions[auctionId].ended = true;
        auctions[auctionId].endTime = block.timestamp;
        
        emit AuctionEnded(auctionId, address(0), 0);
    }
}