cask "pond" do
  arch arm: "arm64", intel: "x64"

  version "2.2.2"
  sha256 arm:   "1a6e9aff991d96348eced33c60b701e872872c151a032a346ae387d372aeb6c6",
         intel: "9e9033239b1722a4559954a67675511b8e7d68b790e5f0dbe7fa9b055a50e3f2"

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
