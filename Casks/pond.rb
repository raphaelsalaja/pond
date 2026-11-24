cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.8.0"
  sha256 arm:   "9f0a118d50e3724df3266e264b7f5d4c3ff7eea7bd8ec97522858898d3785821",
         intel: "f84c802c24bf75975be290eddf64db58d661ddcff50e9b06b0793c6940345066"

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
