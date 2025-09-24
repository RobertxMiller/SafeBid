import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("safebid:address", "Prints the SafeBid address").setAction(async function (_args: TaskArguments, hre) {
  const { deployments } = hre;
  const d = await deployments.get("SafeBid");
  console.log("SafeBid address is", d.address);
});

task("safebid:create", "Create an auction")
  .addParam("name", "Item name")
  .addParam("price", "Start price in ether")
  .addParam("start", "Start time offset in seconds", "300")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const [signer] = await ethers.getSigners();
    const d = await deployments.get("SafeBid");
    const c = await ethers.getContractAt("SafeBid", d.address);
    const price = ethers.parseEther(args.price as string);
    const startTime = BigInt(Math.floor(Date.now() / 1000) + Number(args.start));
    const tx = await c.connect(signer).createAuction(args.name, price, startTime);
    console.log("tx:", tx.hash);
    const r = await tx.wait();
    console.log("status:", r?.status);
  });

