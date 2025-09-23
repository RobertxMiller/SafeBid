import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

// 创建拍卖任务
task("safebid:createAuction")
  .addParam("contract", "SafeBid contract address")
  .addParam("item", "Item name")
  .addParam("price", "Start price in wei")
  .addParam("starttime", "Start time timestamp")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const { contract: contractAddress, item, price, starttime } = taskArguments;
    
    const signers = await ethers.getSigners();
    const safeBid = await ethers.getContractAt("SafeBid", contractAddress);
    
    console.log("Creating auction...");
    const tx = await safeBid
      .connect(signers[0])
      .createAuction(item, price, starttime);
      
    const receipt = await tx.wait();
    console.log(`Transaction hash: ${receipt?.hash}`);
    
    // 获取创建的拍卖ID
    const events = receipt?.logs || [];
    for (const event of events) {
      try {
        const parsedEvent = safeBid.interface.parseLog(event);
        if (parsedEvent?.name === "AuctionCreated") {
          console.log(`Auction created with ID: ${parsedEvent.args.auctionId}`);
          break;
        }
      } catch (e) {
        // Ignore parsing errors for unrelated events
      }
    }
  });

// 出价任务
task("safebid:bid")
  .addParam("contract", "SafeBid contract address")
  .addParam("auctionid", "Auction ID")
  .addParam("amount", "Bid amount in wei")
  .setAction(async function (taskArguments: TaskArguments, { ethers, fhevm }) {
    const { contract: contractAddress, auctionid, amount } = taskArguments;
    
    const signers = await ethers.getSigners();
    const safeBid = await ethers.getContractAt("SafeBid", contractAddress);
    
    // 创建加密输入
    const input = fhevm.createEncryptedInput(contractAddress, signers[0].address);
    input.add32(parseInt(amount));
    const encryptedInput = await input.encrypt();
    
    console.log("Placing bid...");
    const tx = await safeBid
      .connect(signers[0])
      .placeBid(auctionid, encryptedInput.handles[0], encryptedInput.inputProof);
      
    const receipt = await tx.wait();
    console.log(`Bid placed. Transaction hash: ${receipt?.hash}`);
  });

// 查看拍卖信息任务
task("safebid:getAuction")
  .addParam("contract", "SafeBid contract address")
  .addParam("auctionid", "Auction ID")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const { contract: contractAddress, auctionid } = taskArguments;
    
    const safeBid = await ethers.getContractAt("SafeBid", contractAddress);
    
    console.log("Getting auction info...");
    const auction = await safeBid.getAuction(auctionid);
    
    console.log("Auction Info:");
    console.log(`  ID: ${auction.id}`);
    console.log(`  Seller: ${auction.seller}`);
    console.log(`  Item: ${auction.itemName}`);
    console.log(`  Start Price: ${auction.startPrice} wei`);
    console.log(`  Start Time: ${new Date(Number(auction.startTime) * 1000)}`);
    console.log(`  Active: ${auction.active}`);
    console.log(`  Ended: ${auction.ended}`);
    
    if (auction.ended) {
      console.log(`  Winner: ${auction.winner}`);
      console.log(`  Final Price: ${auction.finalPrice} wei`);
    }
  });

// 检查拍卖是否结束任务
task("safebid:checkEnd")
  .addParam("contract", "SafeBid contract address")
  .addParam("auctionid", "Auction ID")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const { contract: contractAddress, auctionid } = taskArguments;
    
    const signers = await ethers.getSigners();
    const safeBid = await ethers.getContractAt("SafeBid", contractAddress);
    
    console.log("Checking if auction should end...");
    const tx = await safeBid
      .connect(signers[0])
      .checkAuctionEnd(auctionid);
      
    const receipt = await tx.wait();
    console.log(`Transaction hash: ${receipt?.hash}`);
    
    // 检查事件看拍卖是否结束
    const events = receipt?.logs || [];
    for (const event of events) {
      try {
        const parsedEvent = safeBid.interface.parseLog(event);
        if (parsedEvent?.name === "AuctionEnded") {
          console.log(`Auction ended! Winner: ${parsedEvent.args.winner}`);
          break;
        }
      } catch (e) {
        // Ignore parsing errors for unrelated events
      }
    }
  });

// 完成购买任务
task("safebid:completePurchase")
  .addParam("contract", "SafeBid contract address")
  .addParam("auctionid", "Auction ID")
  .addParam("value", "Payment amount in wei")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const { contract: contractAddress, auctionid, value } = taskArguments;
    
    const signers = await ethers.getSigners();
    const safeBid = await ethers.getContractAt("SafeBid", contractAddress);
    
    console.log("Completing purchase...");
    const tx = await safeBid
      .connect(signers[0])
      .completePurchase(auctionid, { value });
      
    const receipt = await tx.wait();
    console.log(`Purchase completed. Transaction hash: ${receipt?.hash}`);
  });

// 获取拍卖总数任务
task("safebid:totalAuctions")
  .addParam("contract", "SafeBid contract address")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const { contract: contractAddress } = taskArguments;
    
    const safeBid = await ethers.getContractAt("SafeBid", contractAddress);
    
    const total = await safeBid.getTotalAuctions();
    console.log(`Total auctions: ${total}`);
  });