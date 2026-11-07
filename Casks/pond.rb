cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.4.0"
  sha256 arm:   "25cd2d3af079b90dadcba7f267d35fa234cd516e077da1c2d1ffb1c13f09a4f2",
         intel: "12f3bbe6c50c5d57929d23a3cff1a29aaeb69519927f27289b51371e1180ee82"

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
