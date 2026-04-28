cask "pond" do
  # This cask is a template. To consume, submit it to homebrew/cask or
  # maintain a tap at `raphaelsalaja/tap`. Replace `version` and
  # `sha256` via the electron-builder CI run (`latest-mac.yml` will
  # contain the matching sha).
  version "0.1.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  arch arm: "arm64", intel: "x64"

  url "https://github.com/raphaelsalaja/pond/releases/download/desktop-v#{version}/pond-#{version}-#{arch}.dmg"
  name "pond"
  desc "Local-first archive for things you save from the web"
  homepage "https://github.com/raphaelsalaja/pond"

  livecheck do
    url :url
    strategy :github_latest
    regex(/desktop-v(\d+(?:\.\d+)+)/i)
  end

  app "pond.app"

  zap trash: [
    "~/Library/Application Support/pond",
    "~/Library/Preferences/so.pond.desktop.plist",
    "~/Library/Logs/pond",
  ]
end
