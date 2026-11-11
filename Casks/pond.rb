cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.6.0"
  sha256 arm:   "25ea78e297f96d25f2d35de61fd0f68183de25736f40b71d5a3f80b03051719a",
         intel: "dac7fb67e5a70a2212760ef0f77ef20ea3b6509f447d84fd5518718a2aa715e1"

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
