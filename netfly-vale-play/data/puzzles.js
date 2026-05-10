export default {
  ditoAnswers: ["IRATI", "MAFRA", "PONTE", "GEADA", "CHUVA", "MORRO", "PRETO", "CLIMA", "VAGAO", "APITO", "MONGE", "BENZE"],
  combinadoPuzzles: [
    {
      id: "vale-01",
      groups: [
        { label: "Cidades do Vale", color: "yellow", words: ["IRATI", "MAFRA", "MALLET", "BITURUNA"] },
        { label: "Ferrovia", color: "green", words: ["TRILHO", "VAGAO", "ESTACAO", "APITO"] },
        { label: "Clima", color: "blue", words: ["GEADA", "NEVOA", "VENTO", "CHUVA"] },
        { label: "Tradição", color: "purple", words: ["MONGE", "BENZE", "MATE", "PINHAO"] }
      ]
    },
    {
      id: "vale-02",
      groups: [
        { label: "Noite fria", color: "yellow", words: ["SERENO", "CASACO", "LAREIRA", "NEVOA"] },
        { label: "Ponte e trilho", color: "green", words: ["PONTE", "TRILHO", "VAGAO", "ESTACAO"] },
        { label: "Movimento", color: "blue", words: ["IR", "VIR", "SUBIR", "DESCER"] },
        { label: "Vale do Iguaçu", color: "purple", words: ["IGUACU", "TIMBO", "JANGADA", "CONTESTADO"] }
      ]
    },
    {
      id: "vale-03",
      groups: [
        { label: "Coisas de rua", color: "yellow", words: ["PRACA", "RUA", "BAIRRO", "CENTRO"] },
        { label: "Transporte", color: "green", words: ["ONIBUS", "CARRO", "MOTO", "BICICLETA"] },
        { label: "Clima (curto)", color: "blue", words: ["GEADA", "CHUVA", "VENTO", "CALOR"] },
        { label: "Palavras com 'RIO'", color: "purple", words: ["RIACHO", "RIBEIRO", "RIOAZUL", "RIOCLARO"] }
      ]
    }
  ],
  soletraPuzzles: [
    {
      id: "soletra-01",
      letters: ["C", "O", "N", "T", "E", "S", "A"],
      center: "T",
      words: [
        "ACENTO",
        "ACENTOS",
        "CANTO",
        "CONTA",
        "CONTESA",
        "CONTESTA",
        "CONTESTO",
        "CONTO",
        "COSTA",
        "ESTA",
        "SETA",
        "TACAS",
        "TACOS",
        "TANTO",
        "TENTA",
        "TENTE",
        "TESTA",
        "TOSSE"
      ]
    },
    {
      id: "soletra-02",
      letters: ["A", "B", "R", "I", "G", "O", "U"],
      center: "R",
      words: [
        "ABRIGA",
        "ABRIGAR",
        "ABRIGO",
        "ABRIGOU",
        "AURORA",
        "BURRO",
        "BRIGA",
        "BRIGOU",
        "GAROA",
        "GURI",
        "GURIA",
        "RABO",
        "RIGOR",
        "URUBU"
      ]
    }
  ],
  quandoFoiQuestions: [
    {
      id: "q-01",
      kicker: "História do Vale",
      question: "Em que ano começou a Guerra do Contestado?",
      options: ["1910", "1912", "1914", "1916"],
      answer: "1912",
      explain: "O conflito na região Sul começou em 1912 e se estendeu até 1916.",
      about: "Amanhã tem outra pergunta — e você pode trocar/editar as perguntas no arquivo de puzzles."
    },
    {
      id: "q-02",
      kicker: "Cidades gêmeas",
      question: "Porto União (SC) foi criado como município em que ano?",
      options: ["1915", "1917", "1920", "1930"],
      answer: "1917",
      explain: "Porto União foi criado em 1917 (no contexto da definição de limites entre SC e PR).",
      about: "Quer deixar 100% jornalístico? Troque esta pergunta por um fato que vocês já publicaram no UM Vale."
    },
    {
      id: "q-03",
      kicker: "Cartão-postal",
      question: "A Ponte dos Arcos (Ponte Manoel Ribas) foi inaugurada em que ano?",
      options: ["1942", "1944", "1946", "1950"],
      answer: "1944",
      explain: "A ponte sobre o Rio Iguaçu foi inaugurada em 1944.",
      about: "Se preferir, substitua por perguntas de agenda local (shows, festivais, eventos esportivos)."
    },
    {
      id: "q-04",
      kicker: "Linha do tempo",
      question: "União da Vitória (PR) foi elevada a município em que ano?",
      options: ["1880", "1890", "1900", "1910"],
      answer: "1890",
      explain: "União da Vitória foi elevada a município em 1890.",
      about: "A curadoria das perguntas faz parte do charme — vale criar séries temáticas (ex.: Contestado, Ferrovia, Rio Iguaçu)."
    }
  ]
};
