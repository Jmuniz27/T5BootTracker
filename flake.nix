{
  description = "Boottracker: Entorno Local";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };
  outputs = { self, nixpkgs }:
  let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};
  in
  {
    devShells.${system}.default = pkgs.mkShell {
      buildInputs = with pkgs; [
        python313
        nodejs
        tesseract
        gcc
        zlib
        libjpeg
        stdenv.cc.cc.lib
      ];
      shellHook = ''
        echo "Entorno de Desarrollo Local activado"

        export LDFLAGS="-L${pkgs.lib.makeLibraryPath [
          pkgs.zlib
          pkgs.libjpeg
          pkgs.postgresql_16
        ]}"
        export CPPFLAGS="-I${pkgs.zlib.dev}/include -I${pkgs.libjpeg.dev}/include -I${pkgs.postgresql_16}/include"

        if [ ! -d ".venv" ]; then
          echo "Creando entorno virtual e instalando dependencias..."
          python -m venv .venv
          source .venv/bin/activate
          pip install -r backend/requirements/local.txt
          echo "✅ Backend listo."
        else
          source .venv/bin/activate
        fi

        if [ ! -d "frontend/node_modules" ]; then
          echo "Instalando dependencias del frontend..."
          cd frontend && npm install && cd ..
          echo "✅ Frontend listo."
        fi

        echo "Usa docker-compose para levantar la BD."
      '';
    };
  };
}
