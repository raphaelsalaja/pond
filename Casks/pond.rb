cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.2.1"
  sha256 arm:   "959cf4cb36f90b173e536ca0c9ee98fac71f0895dc807a9cd795149da0daab47",
         intel: "a9b366aa90075b49ef7ab23273a04596a92e4fe95c96d4bbc05c177624b3623c"

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
