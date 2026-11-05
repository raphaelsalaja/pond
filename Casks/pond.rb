cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.3.0"
  sha256 arm:   "f222652a2aa7f86709691c12eecc4da4ba298c379caad2551db8dcd51bbf9805",
         intel: "bbd454f87b33b16d67c3e3fc138867de4615f6b8f9a8c5178904760f90cd5d5a"

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
