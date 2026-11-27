cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.8.2"
  sha256 arm:   "246c326c05b69742d1215dde7acf2c59c059fb6fdee5232cafb33b6bca1e568b",
         intel: "759e2ab38bdb2d2f0a193b913f174bfabac1ae638ddc8e9b6fccd0051b3b9330"

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
