cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.8.1"
  sha256 arm:   "8597487f77f4e01223ec91b4744f9c5a5ec0d3a49c210384d57b60845a13b1d4",
         intel: "5de03080a710acb2d174a54e378c7e21da15bcd44b2f41c523f50c4e20dd9764"

  url "https://github.com/raphaelsalaja/pond/releases/download/v#{version}/Pond-#{version}-#{arch}.dmg"
  name "Pond"
  desc "Local-first archive for things you save from the web"
  homepage "https://github.com/raphaelsalaja/pond"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :ventura

  app "Pond.app"

  zap trash: [
    "~/Library/Application Support/pond",
    "~/Library/Logs/pond",
    "~/Library/Preferences/so.pond.desktop.plist",
  ]
end
