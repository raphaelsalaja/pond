cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.5.0"
  sha256 arm:   "2e00cc95d2392a7f9fbab6ec321501cfe9809d2dba548fcc8161a6aeabaa9e9b",
         intel: "d76c6ca3aaf623a2555f13d3aaeae4d9d1d047873740ca00b4080f8eb2fff7cf"

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
