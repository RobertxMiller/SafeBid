import { expect } from "chai";
import { ethers } from "hardhat";
import { SafeBid } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SafeBid - Sepolia Integration", function () {
  let safeBid: SafeBid;
  let owner: HardhatEthersSigner;
  let seller: HardhatEthersSigner;
  let bidder1: HardhatEthersSigner;

  const ITEM_NAME = "Sepolia测试拍品";
  const START_PRICE = ethers.parseEther("0.01"); // 更小的金额用于测试网

  before(async function () {
    // 跳过测试如果不在Sepolia网络
    if (hre.network.name !== "sepolia") {
      this.skip();
    }

    [owner, seller, bidder1] = await ethers.getSigners();

    // 部署合约（如果还未部署）
    const SafeBidFactory = await ethers.getContractFactory("SafeBid");
    safeBid = await SafeBidFactory.deploy();
    await safeBid.waitForDeployment();

    console.log("SafeBid deployed to:", await safeBid.getAddress());
  });

  describe("Sepolia Network Tests", function () {
    it("Should deploy on Sepolia testnet", async function () {
      expect(await safeBid.getAddress()).to.be.properAddress;
      console.log("Contract deployed at:", await safeBid.getAddress());
    });

    it("Should create auction on Sepolia", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 300; // 5分钟后开始

      const tx = await safeBid
        .connect(seller)
        .createAuction(ITEM_NAME, START_PRICE, startTime);
      
      const receipt = await tx.wait();
      console.log("Auction created, transaction hash:", receipt?.hash);
      console.log("Gas used:", receipt?.gasUsed);

      expect(await safeBid.getTotalAuctions()).to.equal(1);

      const auction = await safeBid.getAuction(0);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.itemName).to.equal(ITEM_NAME);
      expect(auction.startPrice).to.equal(START_PRICE);
    });

    it.skip("Should handle encrypted bids on Sepolia", async function () {
      // 这个测试需要真实的Zama Relayer服务
      // 在实际部署时启用
      console.log("Encrypted bidding test - skipped for CI");
    });

    it("Should check gas costs for operations", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 600;
      
      // 测试创建拍卖的gas成本
      const tx1 = await safeBid
        .connect(seller)
        .createAuction("Gas测试拍品", START_PRICE, startTime);
      const receipt1 = await tx1.wait();
      
      console.log("Create auction gas used:", receipt1?.gasUsed);
      expect(receipt1?.gasUsed).to.be.lessThan(500000); // 应该小于50万gas

      // 测试查询操作的gas成本
      const auctionId = await safeBid.getTotalAuctions() - 1n;
      const tx2 = await safeBid.getAuction(auctionId);
      console.log("Get auction gas estimate: ~1000 gas (view function)");
    });

    it("Should validate contract state consistency", async function () {
      const totalAuctions = await safeBid.getTotalAuctions();
      console.log("Total auctions created:", totalAuctions);

      // 检查每个拍卖的状态
      for (let i = 0; i < Number(totalAuctions); i++) {
        const auction = await safeBid.getAuction(i);
        console.log(`Auction ${i}:`, {
          seller: auction.seller,
          itemName: auction.itemName,
          startPrice: ethers.formatEther(auction.startPrice),
          active: auction.active,
          ended: auction.ended
        });

        expect(auction.seller).to.not.equal(ethers.ZeroAddress);
        expect(auction.itemName).to.not.equal("");
        expect(auction.startPrice).to.be.greaterThan(0);
      }
    });
  });

  describe("Real World Scenarios", function () {
    it("Should handle multiple auctions from different sellers", async function () {
      const [, seller1, seller2] = await ethers.getSigners();
      const startTime = Math.floor(Date.now() / 1000) + 900; // 15分钟后

      // 卖家1创建拍卖
      await safeBid
        .connect(seller1)
        .createAuction("卖家1的拍品", ethers.parseEther("0.005"), startTime);

      // 卖家2创建拍卖
      await safeBid
        .connect(seller2)
        .createAuction("卖家2的拍品", ethers.parseEther("0.008"), startTime + 300);

      const totalAuctions = await safeBid.getTotalAuctions();
      expect(totalAuctions).to.be.greaterThan(2); // 包括之前创建的拍卖

      // 验证不同卖家的拍卖
      const lastAuction = await safeBid.getAuction(totalAuctions - 1n);
      const secondLastAuction = await safeBid.getAuction(totalAuctions - 2n);
      
      expect(lastAuction.seller).to.not.equal(secondLastAuction.seller);
    });

    it("Should handle edge cases for timing", async function () {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // 测试：创建一个开始时间很接近当前时间的拍卖
      const nearFutureTime = currentTime + 30; // 30秒后
      
      const tx = await safeBid
        .connect(seller)
        .createAuction("时间边界测试", START_PRICE, nearFutureTime);
      
      await tx.wait();
      
      const auctionId = (await safeBid.getTotalAuctions()) - 1n;
      const auction = await safeBid.getAuction(auctionId);
      
      expect(auction.startTime).to.equal(nearFutureTime);
      expect(auction.active).to.be.true;
    });

    it("Should validate contract permissions", async function () {
      const [, , , unauthorizedUser] = await ethers.getSigners();
      const totalAuctions = await safeBid.getTotalAuctions();
      
      if (totalAuctions > 0) {
        const lastAuctionId = totalAuctions - 1n;
        
        // 未授权用户不能结束别人的拍卖
        await expect(
          safeBid.connect(unauthorizedUser).endAuction(lastAuctionId)
        ).to.be.revertedWith("Only seller can end auction");
        
        // 未授权用户不能紧急停止别人的拍卖
        await expect(
          safeBid.connect(unauthorizedUser).emergencyStop(lastAuctionId)
        ).to.be.revertedWith("Only seller can emergency stop");
      }
    });
  });

  after(async function () {
    if (hre.network.name === "sepolia") {
      console.log("\n=== Sepolia Test Summary ===");
      console.log("Contract Address:", await safeBid.getAddress());
      console.log("Total Auctions Created:", await safeBid.getTotalAuctions());
      console.log("Network:", hre.network.name);
      console.log("Block Number:", await ethers.provider.getBlockNumber());
      
      const balance = await ethers.provider.getBalance(await safeBid.getAddress());
      console.log("Contract Balance:", ethers.formatEther(balance), "ETH");
    }
  });
});