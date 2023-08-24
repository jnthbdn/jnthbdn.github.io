class SearchBox {
    static SEARCH_INDEX = elasticlunr.Index.load(window.searchIndex);

    constructor(id_searchbox, id_div_result){
        this.searchbox = document.getElementById(id_searchbox);
        this.div_result = document.getElementById(id_div_result);

        this.searchbox.addEventListener("keyup", () => {
            console.log("Key up !");
            this.clean_result();
            this.search(this.searchbox.value)
        })
    }

    clean_result(){
        this.div_result.innerHTML = "";
    }

    search(str){
        let results = SearchBox.SEARCH_INDEX.search(str);

        results.forEach(entry => {
            console.log(entry)
            this.div_result.innerHTML += this.#format_entry(entry.ref, entry.doc.title, entry.doc.description);    
        });
    }

    #format_entry(link, title, description){
        return `
        <div class="post on-list">
            <h4 class="post-title"><a href="${link}">${title}</a></h4>
            <div class="post-content"> ${description} </div>
            <div><a class="read-more button" href="${link}">Lire l'article →</a></div>
        </div>`;
    }
} 