// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Reference fixed-rate market contract for ALK. Not deployed by this website package.
/// Owner must fund this contract with ALK for buys and ETH for sells.
/// tokensPerEth uses ALK's 18 decimals: e.g. 100_000 means 100,000 ALK per 1 ETH.
contract ALEKMarket {
    address public immutable owner;
    IERC20Minimal public immutable alk;
    uint256 public tokensPerEth;
    bool private locked;

    event Bought(address indexed buyer, uint256 ethIn, uint256 alkOut);
    event Sold(address indexed seller, uint256 alkIn, uint256 ethOut);
    event RateChanged(uint256 tokensPerEth);

    modifier onlyOwner() {
        require(msg.sender == owner, "OWNER");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "REENTRANCY");
        locked = true;
        _;
        locked = false;
    }

    constructor(address alkToken, uint256 initialTokensPerEth) {
        require(alkToken != address(0), "TOKEN");
        require(initialTokensPerEth > 0, "RATE");
        owner = msg.sender;
        alk = IERC20Minimal(alkToken);
        tokensPerEth = initialTokensPerEth;
    }

    receive() external payable {}

    function quoteBuy(uint256 ethAmount) public view returns (uint256 alkAmount) {
        return ethAmount * tokensPerEth;
    }

    function quoteSell(uint256 alkAmount) public view returns (uint256 ethAmount) {
        return alkAmount / tokensPerEth;
    }

    function buy() external payable nonReentrant {
        require(msg.value > 0, "ZERO");
        uint256 amount = quoteBuy(msg.value);
        require(alk.balanceOf(address(this)) >= amount, "ALK_LIQUIDITY");
        require(alk.transfer(msg.sender, amount), "ALK_TRANSFER");
        emit Bought(msg.sender, msg.value, amount);
    }

    function sell(uint256 alkAmount) external nonReentrant {
        require(alkAmount > 0, "ZERO");
        uint256 ethAmount = quoteSell(alkAmount);
        require(address(this).balance >= ethAmount, "ETH_LIQUIDITY");
        require(alk.transferFrom(msg.sender, address(this), alkAmount), "ALK_TRANSFER");
        (bool ok,) = payable(msg.sender).call{value: ethAmount}("");
        require(ok, "ETH_TRANSFER");
        emit Sold(msg.sender, alkAmount, ethAmount);
    }

    function setRate(uint256 newTokensPerEth) external onlyOwner {
        require(newTokensPerEth > 0, "RATE");
        tokensPerEth = newTokensPerEth;
        emit RateChanged(newTokensPerEth);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        (bool ok,) = payable(owner).call{value: amount}("");
        require(ok, "ETH_TRANSFER");
    }

    function withdrawALK(uint256 amount) external onlyOwner {
        require(alk.transfer(owner, amount), "ALK_TRANSFER");
    }
}
