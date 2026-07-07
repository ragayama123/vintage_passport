import { expect } from "chai";
import { ethers } from "hardhat";

describe("VintagePassport", () => {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("VintagePassport");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return { contract, owner, alice, bob };
  }

  const sampleAppraisal = {
    appraisalHash:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    criteriaHash:
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    estimatedEra: "1974-1976",
    confidence: 82,
    appraisedAt: 1720000000,
  };

  it("mint → appraisals取得 → transfer → 再取得（履歴が引き継がれる）", async () => {
    const { contract, owner, alice, bob } = await deploy();

    // mint
    const tx = await contract.mintWithAppraisal(
      alice.address,
      "ipfs://QmSampleCid",
      sampleAppraisal
    );
    const receipt = await tx.wait();

    // AppraisalMinted イベントが出る
    const ev = receipt!.logs
      .map((l) => {
        try {
          return contract.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p) => p?.name === "AppraisalMinted");
    expect(ev).to.not.equal(undefined);
    const tokenId = ev!.args.tokenId as bigint;
    expect(tokenId).to.equal(0n);

    // 所有者・tokenURI・appraisals を確認
    expect(await contract.ownerOf(tokenId)).to.equal(alice.address);
    expect(await contract.tokenURI(tokenId)).to.equal("ipfs://QmSampleCid");

    const a = await contract.appraisals(tokenId);
    expect(a.appraisalHash).to.equal(sampleAppraisal.appraisalHash);
    expect(a.criteriaHash).to.equal(sampleAppraisal.criteriaHash);
    expect(a.estimatedEra).to.equal("1974-1976");
    expect(a.confidence).to.equal(82);

    // transfer(転売)して履歴が2件以上になる
    await contract
      .connect(alice)
      .transferFrom(alice.address, bob.address, tokenId);
    expect(await contract.ownerOf(tokenId)).to.equal(bob.address);

    // 転送後も鑑定データは書き換わらない
    const a2 = await contract.appraisals(tokenId);
    expect(a2.appraisalHash).to.equal(sampleAppraisal.appraisalHash);
    expect(a2.estimatedEra).to.equal("1974-1976");
  });

  it("owner以外はミントできない(onlyOwner)", async () => {
    const { contract, alice } = await deploy();
    await expect(
      contract
        .connect(alice)
        .mintWithAppraisal(alice.address, "ipfs://x", sampleAppraisal)
    ).to.be.reverted;
  });

  it("Transfer イベントで所有履歴を再構築できる", async () => {
    const { contract, owner, alice, bob } = await deploy();
    await contract.mintWithAppraisal(alice.address, "ipfs://x", sampleAppraisal);
    await contract
      .connect(alice)
      .transferFrom(alice.address, bob.address, 0n);

    const events = await contract.queryFilter(contract.filters.Transfer());
    // mint(0x0→alice) と transfer(alice→bob) の2件
    expect(events.length).to.equal(2);
    expect(events[0].args.from).to.equal(ethers.ZeroAddress);
    expect(events[0].args.to).to.equal(alice.address);
    expect(events[1].args.from).to.equal(alice.address);
    expect(events[1].args.to).to.equal(bob.address);
  });
});
