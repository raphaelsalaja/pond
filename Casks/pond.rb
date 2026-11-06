cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.3.1"
  sha256 arm:   "c48cc820560a5896ba2faf3fbb51551347d349f11c8131f4d487c8851ef48961",
         intel: "6e41e0ab7bcc42c725679c9993d0cb8bb85db520156696ba1677c04b251dbb46"

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
