import { expect } from "chai";
import { ethers } from "hardhat";
import { SafeBid } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("SafeBid", function () {
  let safeBid: SafeBid;
  let owner: HardhatEthersSigner;
  let seller: HardhatEthersSigner;
  let bidder1: HardhatEthersSigner;
  let bidder2: HardhatEthersSigner;

  const ITEM_NAME = "测试拍品";
  const START_PRICE = ethers.parseEther("1.0");
  const BID_TIMEOUT = 60; // 60秒

  beforeEach(async function () {
    [owner, seller, bidder1, bidder2] = await ethers.getSigners();

    const SafeBidFactory = await ethers.getContractFactory("SafeBid");
    safeBid = await SafeBidFactory.deploy();
    await safeBid.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await safeBid.getAddress()).to.be.properAddress;
    });

    it("Should initialize with zero auctions", async function () {
      expect(await safeBid.getTotalAuctions()).to.equal(0);
    });
  });

  describe("Creating Auctions", function () {
    it("Should create a new auction successfully", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 3600; // 1小时后开始

      await expect(
        safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, startTime)
      )
        .to.emit(safeBid, "AuctionCreated")
        .withArgs(0, seller.address, ITEM_NAME, START_PRICE, startTime);

      expect(await safeBid.getTotalAuctions()).to.equal(1);

      const auction = await safeBid.getAuction(0);
      expect(auction.id).to.equal(0);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.itemName).to.equal(ITEM_NAME);
      expect(auction.startPrice).to.equal(START_PRICE);
      expect(auction.startTime).to.equal(startTime);
      expect(auction.active).to.be.true;
      expect(auction.ended).to.be.false;
    });

    it("Should reject auction with past start time", async function () {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1小时前

      await expect(
        safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, pastTime)
      ).to.be.revertedWith("Start time must be in future");
    });

    it("Should reject auction with zero start price", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        safeBid.connect(seller).createAuction(ITEM_NAME, 0, startTime)
      ).to.be.revertedWith("Start price must be greater than 0");
    });

    it("Should reject auction with empty item name", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        safeBid.connect(seller).createAuction("", START_PRICE, startTime)
      ).to.be.revertedWith("Item name cannot be empty");
    });
  });

  describe("Bidding", function () {
    let auctionId: number;
    let startTime: number;

    beforeEach(async function () {
      const currentBlockTime = (await ethers.provider.getBlock('latest'))!.timestamp;
      startTime = currentBlockTime + 100; // 当前区块时间后100秒
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, startTime);
      auctionId = 0;

      // 等待拍卖开始
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);
    });

    it("Should allow valid encrypted bids", async function () {
      const bidAmount = 1500000000; // 1.5 ETH in smaller units for 32-bit encryption

      // 创建加密输入
      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        bidder1.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await expect(
        safeBid
          .connect(bidder1)
          .placeBid(auctionId, encryptedInput.handles[0], encryptedInput.inputProof)
      )
        .to.emit(safeBid, "BidPlaced")
        .withArgs(auctionId, bidder1.address, await ethers.provider.getBlock('latest').then(b => b!.timestamp + 1));

      expect(await safeBid.getBidCount(auctionId)).to.equal(1);
      expect(await safeBid.currentLeader(auctionId)).to.equal(bidder1.address);
    });

    it("Should reject bids from auction seller", async function () {
      const bidAmount = 1500000000;

      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        seller.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await expect(
        safeBid
          .connect(seller)
          .placeBid(auctionId, encryptedInput.handles[0], encryptedInput.inputProof)
      ).to.be.revertedWith("Seller cannot bid");
    });

    it("Should reject bids on non-existent auction", async function () {
      const bidAmount = 1500000000;

      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        bidder1.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await expect(
        safeBid
          .connect(bidder1)
          .placeBid(999, encryptedInput.handles[0], encryptedInput.inputProof)
      ).to.be.revertedWith("Auction does not exist");
    });

    it("Should reject bids before auction starts", async function () {
      // 创建一个未来的拍卖
      const futureStartTime = Math.floor(Date.now() / 1000) + 3600; // 1小时后
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, futureStartTime);
      const futureAuctionId = 1;

      const bidAmount = 1500000000;
      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        bidder1.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await expect(
        safeBid
          .connect(bidder1)
          .placeBid(futureAuctionId, encryptedInput.handles[0], encryptedInput.inputProof)
      ).to.be.revertedWith("Auction not started");
    });
  });

  describe("Auction Ending", function () {
    let auctionId: number;
    let startTime: number;

    beforeEach(async function () {
      const currentBlockTime = (await ethers.provider.getBlock('latest'))!.timestamp;
      startTime = currentBlockTime + 100;
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, startTime);
      auctionId = 0;

      // 等待拍卖开始
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);
    });

    it("Should end auction after timeout with no bids", async function () {
      // 放置一个出价
      const bidAmount = 1500000000;
      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        bidder1.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await safeBid
        .connect(bidder1)
        .placeBid(auctionId, encryptedInput.handles[0], encryptedInput.inputProof);

      // 等待超时时间
      const currentTime = await ethers.provider.getBlock('latest').then(b => b!.timestamp);
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTime + BID_TIMEOUT + 1]);
      
      await expect(safeBid.connect(bidder1).checkAuctionEnd(auctionId))
        .to.emit(safeBid, "AuctionEnded");

      const auction = await safeBid.getAuction(auctionId);
      expect(auction.ended).to.be.true;
      expect(auction.active).to.be.false;
      expect(auction.winner).to.equal(bidder1.address);
    });

    it("Should allow seller to manually end auction", async function () {
      // 放置一个出价
      const bidAmount = 1500000000;
      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        bidder1.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await safeBid
        .connect(bidder1)
        .placeBid(auctionId, encryptedInput.handles[0], encryptedInput.inputProof);

      // 等待超时时间
      const currentTime = await ethers.provider.getBlock('latest').then(b => b!.timestamp);
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTime + BID_TIMEOUT + 1]);
      
      await expect(safeBid.connect(seller).endAuction(auctionId))
        .to.emit(safeBid, "AuctionEnded");

      const auction = await safeBid.getAuction(auctionId);
      expect(auction.ended).to.be.true;
    });

    it("Should reject manual end from non-seller", async function () {
      await expect(safeBid.connect(bidder1).endAuction(auctionId))
        .to.be.revertedWith("Only seller can end auction");
    });

    it("Should allow emergency stop by seller", async function () {
      await expect(safeBid.connect(seller).emergencyStop(auctionId))
        .to.emit(safeBid, "AuctionEnded")
        .withArgs(auctionId, ethers.ZeroAddress, 0);

      const auction = await safeBid.getAuction(auctionId);
      expect(auction.ended).to.be.true;
      expect(auction.active).to.be.false;
    });
  });

  describe("Purchase Completion", function () {
    let auctionId: number;
    let startTime: number;

    beforeEach(async function () {
      const currentBlockTime = (await ethers.provider.getBlock('latest'))!.timestamp;
      startTime = currentBlockTime + 100;
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, startTime);
      auctionId = 0;

      // 等待拍卖开始并进行出价
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const bidAmount = 1500000000;
      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        bidder1.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await safeBid
        .connect(bidder1)
        .placeBid(auctionId, encryptedInput.handles[0], encryptedInput.inputProof);

      // 结束拍卖
      const currentTime = await ethers.provider.getBlock('latest').then(b => b!.timestamp);
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTime + BID_TIMEOUT + 1]);
      await safeBid.connect(seller).endAuction(auctionId);
    });

    it("Should allow winner to complete purchase", async function () {
      const initialSellerBalance = await ethers.provider.getBalance(seller.address);
      const paymentAmount = START_PRICE;

      await expect(
        safeBid.connect(bidder1).completePurchase(auctionId, { value: paymentAmount })
      ).to.not.be.reverted;

      const finalSellerBalance = await ethers.provider.getBalance(seller.address);
      expect(finalSellerBalance - initialSellerBalance).to.equal(paymentAmount);
    });

    it("Should reject purchase from non-winner", async function () {
      await expect(
        safeBid.connect(bidder2).completePurchase(auctionId, { value: START_PRICE })
      ).to.be.revertedWith("Not the winner");
    });

    it("Should reject purchase with insufficient payment", async function () {
      const insufficientPayment = START_PRICE / 2n;

      await expect(
        safeBid.connect(bidder1).completePurchase(auctionId, { value: insufficientPayment })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should reject purchase on active auction", async function () {
      // 创建新的活跃拍卖
      const currentBlockTime = (await ethers.provider.getBlock('latest'))!.timestamp;
      const newStartTime = currentBlockTime + 100;
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, newStartTime);
      const newAuctionId = 1;

      await expect(
        safeBid.connect(bidder1).completePurchase(newAuctionId, { value: START_PRICE })
      ).to.be.revertedWith("Auction not ended");
    });
  });

  describe("View Functions", function () {
    it("Should return correct auction information", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 3600;
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, startTime);
      
      const auction = await safeBid.getAuction(0);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.itemName).to.equal(ITEM_NAME);
      expect(auction.startPrice).to.equal(START_PRICE);
    });

    it("Should return correct bid count", async function () {
      const currentBlockTime = (await ethers.provider.getBlock('latest'))!.timestamp;
      const startTime = currentBlockTime + 100;
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, startTime);
      
      expect(await safeBid.getBidCount(0)).to.equal(0);

      // 等待拍卖开始并出价
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const bidAmount = 1500000000;
      const input = fhevm.createEncryptedInput(
        await safeBid.getAddress(),
        bidder1.address
      );
      input.add32(bidAmount);
      const encryptedInput = await input.encrypt();

      await safeBid
        .connect(bidder1)
        .placeBid(0, encryptedInput.handles[0], encryptedInput.inputProof);

      expect(await safeBid.getBidCount(0)).to.equal(1);
    });

    it("Should return total auctions count", async function () {
      expect(await safeBid.getTotalAuctions()).to.equal(0);

      const startTime = Math.floor(Date.now() / 1000) + 3600;
      await safeBid.connect(seller).createAuction(ITEM_NAME, START_PRICE, startTime);
      expect(await safeBid.getTotalAuctions()).to.equal(1);

      await safeBid.connect(seller).createAuction("第二个拍品", START_PRICE, startTime + 3600);
      expect(await safeBid.getTotalAuctions()).to.equal(2);
    });
  });
});