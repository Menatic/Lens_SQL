export interface Lesson {
  id:            string;
  title:         string;
  subtitle:      string;
  duration:      string;
  difficulty:    'beginner' | 'intermediate' | 'advanced';
  theory:        { heading: string; body: string }[];
  initialSql:    string;
  challenge:     string;
  hints:         string[];
  keyOperators:  string[];
  concepts:      string[];
  next:          string | null;
}

export const LESSONS: Lesson[] = [
  {
    id: '01-what-is-a-plan',
    title: 'What is a Query Execution Plan?',
    subtitle: 'Every SQL query has a secret — the plan your database uses to answer it.',
    duration: '5 min',
    difficulty: 'beginner',
    theory: [
      {
        heading: 'SQL is declarative, not procedural',
        body: 'When you write SQL you say *what* you want — not *how* to get it. The database engine figures out the how. That decision is the execution plan: a tree of physical operations the engine will perform to compute your result.',
      },
      {
        heading: 'The plan is a tree of operators',
        body: 'Each node in the tree is an operator — a unit of work. A SEQ_SCAN reads rows from a table. A FILTER discards rows that fail a predicate. A HASH_JOIN combines two inputs. Data flows upward: children produce rows, parents consume them. This model is called the Volcano iterator model.',
      },
      {
        heading: 'Why plans matter',
        body: 'Two semantically identical queries can have radically different plans — and therefore wildly different performance. A query that takes 5 seconds could take 5 milliseconds with a better plan. Understanding plans is the single most powerful skill for writing fast SQL.',
      },
    ],
    initialSql: `-- This is the simplest possible query — a full table scan.
-- Run it and observe the plan on the right.
SELECT * FROM movies LIMIT 10`,
    challenge: 'Run the query and look at the Execution Plan tab. You should see a SEQ_SCAN operator. That is DuckDB reading rows directly from the movies table. Now try changing LIMIT 10 to LIMIT 1 — does the plan change?',
    hints: [
      'Press Ctrl+Enter (or click Run) to execute the query.',
      'The blue SEQ_SCAN node represents a sequential scan — reading every row.',
      'With LIMIT 1, look for a LIMIT or TOP_N operator above the scan.',
    ],
    keyOperators: ['SEQ_SCAN', 'LIMIT'],
    concepts: ['Execution plan', 'Operators', 'Volcano model', 'SEQ_SCAN'],
    next: '02-table-scans',
  },
  {
    id: '02-table-scans',
    title: 'The Cost of Scanning',
    subtitle: 'When your database reads every single row — and when it has no choice.',
    duration: '6 min',
    difficulty: 'beginner',
    theory: [
      {
        heading: 'The sequential scan',
        body: 'A SEQ_SCAN (sequential scan) reads every row in a table from start to finish. For a table with 20,000 rows it reads all 20,000 — even if you only want 5. This is O(n) work regardless of your query.',
      },
      {
        heading: 'When scans are unavoidable',
        body: 'Without an index, a scan is the only option. If you ask "find all orders where price > 10" and there\'s no index on price, the engine must check every row. The scan itself isn\'t the enemy — using a scan when you only need a fraction of rows is.',
      },
      {
        heading: 'Scan + filter = most basic query',
        body: 'A WHERE clause doesn\'t eliminate the scan — it adds a FILTER operator on top of it. The scan still reads all rows; the filter then discards the ones that don\'t match. In DuckDB the filter is often pushed down inside the scan (predicate pushdown), making it faster, but rows still need to be read from storage.',
      },
    ],
    initialSql: `-- How many rows does this scan?
-- The orders table has 20,000 rows.
SELECT order_id, price_usd, status
FROM orders
WHERE price_usd > 20.00`,
    challenge: 'Look at the plan. Even though you\'re filtering for high-price orders, notice the scan reads the whole table. Now check the Results tab — how many rows came back? Compare that to the 20,000 that were scanned. Change the WHERE to status = \'completed\' AND price_usd > 23 — watch the estimated vs actual rows.',
    hints: [
      'The actual row count returned is much smaller than 20,000 — but the scan still read all of them.',
      'Try removing the WHERE clause entirely — the plan is identical but returns more rows.',
      'In the post-run stats (after the plan updates), look for "actual rows" on the FILTER node.',
    ],
    keyOperators: ['SEQ_SCAN', 'FILTER', 'PROJECTION'],
    concepts: ['Sequential scan', 'Predicate evaluation', 'Selectivity', 'Filter pushdown'],
    next: '03-projections-and-cost',
  },
  {
    id: '03-projections-and-cost',
    title: 'SELECT * is a Lie',
    subtitle: 'Projections, column pruning, and why you should never select everything.',
    duration: '5 min',
    difficulty: 'beginner',
    theory: [
      {
        heading: 'What projection means',
        body: 'A PROJECTION operator selects which columns to return. When you write SELECT *, the engine must read, hold in memory, and transmit every column for every row. Modern columnar databases like DuckDB store data column-by-column — SELECT * forces them to read all columns, losing the main performance benefit.',
      },
      {
        heading: 'Column pruning',
        body: 'When you write SELECT title, rating FROM movies instead of SELECT *, the query planner performs column pruning — it only reads those two columns from storage. For a table with 9 columns, this can reduce I/O by 7×.',
      },
      {
        heading: 'Compute cost in projections',
        body: 'Projections can also contain expressions: price_usd * quantity AS total, strftime(order_date, \'%Y\') AS year. These are computed row-by-row inside the projection operator, which appears in the plan as a node above the scan.',
      },
    ],
    initialSql: `-- Compare these two queries side by side.
-- First, run this one and check the plan:
SELECT title, year, rating
FROM movies
WHERE genre = 'Action'
ORDER BY rating DESC
LIMIT 20`,
    challenge: 'Run this query, then change SELECT title, year, rating to SELECT * and run again. Notice the plan gains a PROJECTION node and the query reads all 9 columns. Now add a computed column: price_usd * quantity AS revenue to an orders query and see where the computation appears in the plan.',
    hints: [
      'Try: SELECT order_id, price_usd * quantity AS revenue FROM orders LIMIT 100',
      'The PROJECTION node is where column computation and selection happens.',
      'In columnar databases, selecting fewer columns is a free performance win — always be specific.',
    ],
    keyOperators: ['SEQ_SCAN', 'FILTER', 'PROJECTION', 'ORDER_BY', 'LIMIT'],
    concepts: ['Projection', 'Column pruning', 'Columnar storage', 'Computed expressions'],
    next: '04-sorting',
  },
  {
    id: '04-sorting',
    title: 'The Hidden Cost of ORDER BY',
    subtitle: 'Sorting is expensive and almost always blocking. Here\'s why.',
    duration: '7 min',
    difficulty: 'beginner',
    theory: [
      {
        heading: 'Sorting requires all rows first',
        body: 'An ORDER BY forces the engine to collect every row that matches the query before it can emit a single result. It is a blocking operator — it cannot start producing output until its input is fully consumed. This makes it fundamentally different from operators like FILTER that can stream row-by-row.',
      },
      {
        heading: 'Sort complexity',
        body: 'Sorting n rows takes O(n log n) time. For 20,000 rows that\'s ~300,000 comparisons. For 20 million rows it\'s ~500 million. This is also why ORDER BY without LIMIT on large tables is dangerous in production.',
      },
      {
        heading: 'TopN optimisation',
        body: 'DuckDB recognises the pattern ORDER BY ... LIMIT n and replaces the full sort with a heap-based TopN operation. Instead of sorting all rows and taking the top n, it maintains a min-heap of n elements as it scans. This turns O(n log n) into O(n log k) where k is your LIMIT — dramatically faster.',
      },
    ],
    initialSql: `-- Full sort: every row is sorted, then top 10 taken
SELECT title, rating, votes
FROM movies
ORDER BY rating DESC, votes DESC
LIMIT 10`,
    challenge: 'Run this query and look for a TOP_N or ORDER_BY node. Now remove the LIMIT and run again — does the plan change? Finally, try sorting 20,000 orders: SELECT * FROM orders ORDER BY price_usd DESC — watch the timing difference with and without LIMIT 20.',
    hints: [
      'With LIMIT, DuckDB uses TOP_N which only keeps 10 rows in memory at any time.',
      'Without LIMIT, it must sort all rows — notice the time difference.',
      'Real production query: always add LIMIT when sorting large tables unless you need all rows sorted.',
    ],
    keyOperators: ['ORDER_BY', 'TOP_N', 'LIMIT'],
    concepts: ['Blocking operators', 'O(n log n) sort', 'TopN optimisation', 'ORDER BY LIMIT'],
    next: '05-aggregation',
  },
  {
    id: '05-aggregation',
    title: 'GROUP BY: Aggregation Under the Hood',
    subtitle: 'Hash tables, streaming aggregation, and how COUNT(*) actually works.',
    duration: '8 min',
    difficulty: 'intermediate',
    theory: [
      {
        heading: 'Hash aggregation',
        body: 'GROUP BY is implemented as a hash aggregate. The engine builds a hash table in memory: each unique group key maps to an accumulator (running sum, count, min, max). As rows flow in from the scan, each row updates its group\'s accumulator. When all rows are processed, the hash table is emitted as the result.',
      },
      {
        heading: 'Streaming aggregation',
        body: 'If the input is already sorted by the GROUP BY key, the engine can use streaming aggregation instead — it detects group boundaries and emits results as it goes without building the full hash table. DuckDB chooses between these based on whether a sort already exists in the plan.',
      },
      {
        heading: 'HAVING vs WHERE',
        body: 'WHERE filters rows before aggregation. HAVING filters groups after aggregation. Filtering with WHERE is always cheaper — it reduces the rows the aggregation has to process. HAVING only works for conditions on aggregated values (like HAVING COUNT(*) > 5).',
      },
    ],
    initialSql: `-- Aggregate across a join: genre → revenue
SELECT
  m.genre,
  COUNT(o.order_id)   AS total_orders,
  SUM(o.price_usd)    AS total_revenue,
  AVG(m.rating)       AS avg_rating
FROM orders o
JOIN movies m ON o.movie_id = m.movie_id
GROUP BY m.genre
HAVING SUM(o.price_usd) > 10000
ORDER BY total_revenue DESC`,
    challenge: 'Run the query. Find the HASH_GROUP_BY node — notice it sits above the JOIN in the plan (aggregation happens after joining). Now remove the HAVING clause and compare the row count. Then try moving the spirit of the filter into a WHERE clause — e.g. WHERE o.price_usd > 5 — and watch the plan change.',
    hints: [
      'HASH_GROUP_BY appears above the JOIN — you can\'t aggregate what you haven\'t joined yet.',
      'HAVING filters groups; WHERE filters rows. Both appear in the plan but at different levels.',
      'Try GROUP BY with ROLLUP or add multiple aggregate functions — the aggregator handles them all in one pass.',
    ],
    keyOperators: ['HASH_GROUP_BY', 'PERFECT_HASH_GROUP_BY', 'FILTER'],
    concepts: ['Hash aggregation', 'HAVING vs WHERE', 'Aggregation position in plan', 'Running accumulators'],
    next: '06-joins-intro',
  },
  {
    id: '06-joins-intro',
    title: 'Your First JOIN: Hash Join',
    subtitle: 'How databases combine two tables — and why it\'s not magic.',
    duration: '8 min',
    difficulty: 'intermediate',
    theory: [
      {
        heading: 'The hash join algorithm',
        body: 'A hash join has two phases. In the build phase, it reads the smaller table (the "build side") and inserts every row into a hash table, keyed by the join column. In the probe phase, it reads every row from the larger table (the "probe side") and looks up each row\'s key in the hash table. Matches are emitted as output rows.',
      },
      {
        heading: 'Build side vs probe side',
        body: 'The optimizer chooses which table is the build side. It prefers the smaller table (less memory) or the one returned by a filtered scan (fewer rows). You\'ll see this in the plan as two children of the HASH_JOIN node — the left child is usually the build side.',
      },
      {
        heading: 'JOIN types in the plan',
        body: 'INNER JOIN emits rows that match in both tables. LEFT JOIN emits all rows from the left table plus matches from the right (NULLs for non-matches). These produce different operators: HASH_JOIN for inner, and variants for outer joins. The difference is visible in the plan.',
      },
    ],
    initialSql: `-- Inner join: only customers who placed orders
SELECT
  c.name,
  c.country,
  o.order_id,
  o.price_usd,
  o.order_date
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status = 'completed'
LIMIT 50`,
    challenge: 'Run the query. Find the HASH_JOIN node — it has two children. The smaller table (customers, 2K rows) is the build side; orders (20K rows) is the probe side. Now change JOIN to LEFT JOIN — does the operator change? Finally, try joining all three tables: orders → customers → movies.',
    hints: [
      'The build side (smaller table) is typically the left child of HASH_JOIN.',
      'LEFT JOIN may show as HASH_JOIN with a different join type flag in the extra info.',
      'Three-table join: JOIN customers c ON ... JOIN movies m ON o.movie_id = m.movie_id',
    ],
    keyOperators: ['HASH_JOIN', 'SEQ_SCAN'],
    concepts: ['Hash join', 'Build side', 'Probe side', 'INNER vs LEFT JOIN', 'Join ordering'],
    next: '07-complex-joins',
  },
  {
    id: '07-complex-joins',
    title: 'Multi-Table Joins and Join Ordering',
    subtitle: 'Why the order you join tables matters, and how the planner decides.',
    duration: '10 min',
    difficulty: 'intermediate',
    theory: [
      {
        heading: 'Join ordering problem',
        body: 'For n tables, there are O(n!) possible join orderings. Joining A to B to C produces a different intermediate result size than C to B to A. The optimizer\'s job is to find the cheapest order — it uses table statistics (row counts, distinct values) to estimate how many rows each join will produce.',
      },
      {
        heading: 'Intermediate result sizes',
        body: 'If you join orders (20K) to movies (5K) first, you get up to 20K rows. If you filter movies to Action genre first (say 500 rows), then join to orders, you get far fewer intermediate rows. Getting small results early keeps subsequent joins fast.',
      },
      {
        heading: 'Bushy vs left-deep plans',
        body: 'DuckDB can produce bushy join trees (where both sides of a join are themselves joins) or left-deep trees (a chain where the right side is always a scan). The plan shape affects whether the engine can pipeline operations. Lens shows you exactly which shape was chosen.',
      },
    ],
    initialSql: `-- Three-way join: combine all tables
SELECT
  c.country,
  m.genre,
  COUNT(*)            AS orders,
  SUM(o.price_usd)    AS revenue,
  AVG(m.rating)       AS avg_movie_rating
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN movies m    ON o.movie_id    = m.movie_id
WHERE o.status = 'completed'
  AND m.year >= 2010
GROUP BY c.country, m.genre
ORDER BY revenue DESC
LIMIT 30`,
    challenge: 'Run the query and study the full plan tree. Count how many levels deep it goes. Notice which joins happen first (bottom of the tree) vs last (top). Now add a very selective filter: AND m.genre = \'Action\' AND c.country = \'United States\'. Does the join order change? Which table becomes the build side?',
    hints: [
      'More selective filters → smaller intermediate results → different join order.',
      'The planner reads statistics to estimate row counts at each step.',
      'Deep trees with many operators are normal for complex queries — this is what the planner is doing for you.',
    ],
    keyOperators: ['HASH_JOIN', 'HASH_GROUP_BY', 'ORDER_BY', 'FILTER'],
    concepts: ['Join ordering', 'Cardinality estimation', 'Intermediate results', 'Plan shapes'],
    next: '08-subqueries-ctes',
  },
  {
    id: '08-subqueries-ctes',
    title: 'Subqueries and CTEs: Same Plan?',
    subtitle: 'Whether you use WITH or a nested SELECT, the planner often produces the same tree.',
    duration: '8 min',
    difficulty: 'intermediate',
    theory: [
      {
        heading: 'CTEs are syntactic sugar (usually)',
        body: 'A CTE (WITH clause) is primarily a readability tool. In most cases, the query planner inlines the CTE — it treats it as if you had written the subquery inline. The resulting plan is identical. You can verify this in Lens: write the same logic as a CTE and as a subquery, compare the plans.',
      },
      {
        heading: 'Correlated subqueries are different',
        body: 'A correlated subquery references the outer query\'s rows: WHERE price > (SELECT AVG(price) FROM orders WHERE customer_id = o.customer_id). This subquery re-executes for every outer row — it can be O(n²). DuckDB often decorrelates these automatically, turning them into joins.',
      },
      {
        heading: 'Materialised CTEs',
        body: 'In some databases, CTEs are materialised — computed once and stored. DuckDB inlines by default. If you need materialisation (to avoid recomputing an expensive subquery used twice), check the plan — if the CTE appears twice in the tree, it\'s not being materialised.',
      },
    ],
    initialSql: `-- CTE version
WITH high_value_orders AS (
  SELECT customer_id, SUM(price_usd) AS lifetime_value
  FROM orders
  WHERE status = 'completed'
  GROUP BY customer_id
  HAVING SUM(price_usd) > 150
)
SELECT c.name, c.country, h.lifetime_value
FROM high_value_orders h
JOIN customers c ON h.customer_id = c.customer_id
ORDER BY h.lifetime_value DESC
LIMIT 25`,
    challenge: 'Run the CTE version. Then rewrite it as a subquery: replace the WITH block with a subquery in the FROM clause (FROM (SELECT ...) h). Run it and compare the plans — they should be identical or very similar. This proves the CTE was inlined by the planner.',
    hints: [
      'Subquery version: SELECT ... FROM (SELECT customer_id, SUM(...) FROM orders ...) h JOIN customers c ...',
      'If the plans look the same, the planner inlined the CTE.',
      'Try using the CTE twice in the same query and see if the plan changes.',
    ],
    keyOperators: ['HASH_JOIN', 'HASH_GROUP_BY', 'FILTER'],
    concepts: ['CTE inlining', 'Subquery decorrelation', 'Materialisation', 'Semantic equivalence'],
    next: '09-optimization-patterns',
  },
  {
    id: '09-optimization-patterns',
    title: 'Writing SQL That Performs',
    subtitle: 'Five patterns that reliably produce better plans.',
    duration: '12 min',
    difficulty: 'advanced',
    theory: [
      {
        heading: 'Filter early, filter often',
        body: 'Push filtering as close to the data source as possible. Compare: SELECT * FROM orders JOIN movies ON ... WHERE movies.year > 2020 — here the filter on movies happens after the join. Rewrite as: JOIN (SELECT * FROM movies WHERE year > 2020) m ON ... and the filter happens before the join, reducing the join\'s input size.',
      },
      {
        heading: 'Avoid functions on indexed/filtered columns',
        body: 'WHERE LOWER(country) = \'france\' forces the engine to apply LOWER() to every row before comparing. The plan shows this as a function call inside the filter. WHERE country = \'France\' can be optimised much better. Same issue: WHERE strftime(order_date, \'%Y\') = \'2022\' — use WHERE order_date >= \'2022-01-01\' AND order_date < \'2023-01-01\' instead.',
      },
      {
        heading: 'Limit before joining',
        body: 'If you know you only want 10 results, can you reduce the inputs before the join? SELECT ... FROM (SELECT * FROM orders LIMIT 1000) o JOIN movies m ... will join only 1000 orders instead of 20,000. Not always correct semantically, but when exploring data it dramatically speeds things up.',
      },
    ],
    initialSql: `-- SLOW pattern: function on filter column, late filtering
SELECT
  c.name,
  COUNT(*) AS orders
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN movies m    ON o.movie_id = m.movie_id
WHERE UPPER(c.country) = 'UNITED STATES'
  AND strftime(o.order_date, '%Y') = '2022'
GROUP BY c.name
ORDER BY orders DESC
LIMIT 20`,
    challenge: 'Run the slow version and note the time. Now rewrite it to: (1) remove the UPPER() call — use = \'United States\' instead, (2) replace the strftime filter with a range: o.order_date >= \'2022-01-01\' AND o.order_date < \'2023-01-01\'. Run again and compare the plans and timing.',
    hints: [
      'Replace UPPER(c.country) = \'UNITED STATES\' with c.country = \'United States\'',
      'Replace strftime(o.order_date, \'%Y\') = \'2022\' with date ranges',
      'Look for FILTER nodes in both plans — the optimised version should have simpler filter conditions.',
    ],
    keyOperators: ['FILTER', 'HASH_JOIN', 'HASH_GROUP_BY'],
    concepts: ['Predicate pushdown', 'Function in predicates', 'Sargable predicates', 'Filter selectivity'],
    next: '10-explain-analyze',
  },
  {
    id: '10-explain-analyze',
    title: 'Reading EXPLAIN ANALYZE Like a Pro',
    subtitle: 'Actual rows vs estimated rows — finding the bottleneck in a real plan.',
    duration: '10 min',
    difficulty: 'advanced',
    theory: [
      {
        heading: 'Estimated vs actual',
        body: 'The pre-execution plan shows estimated row counts based on table statistics. After execution, EXPLAIN ANALYZE shows actual row counts. When estimated and actual diverge wildly, the planner made bad decisions — wrong join order, wrong algorithm choice. Lens shows both after you run a query.',
      },
      {
        heading: 'Finding the bottleneck',
        body: 'Look at per-operator timing in the post-execution plan (the stats overlay). The operator with the highest time is your bottleneck. Is it a scan? You need an index or better filtering. Is it a sort? You need to reduce rows before sorting or add LIMIT. Is it a join? Check the intermediate sizes.',
      },
      {
        heading: 'The N+1 query pattern',
        body: 'The most common ORM performance bug: fetching N customers, then running 1 query per customer to get their orders. This produces N+1 queries instead of 1 join. The plan for the joined version is dramatically simpler. In an interview, being able to spot this and fix it with a join is a strong signal.',
      },
    ],
    initialSql: `-- A complex query: multiple joins, aggregations, window-like patterns
-- After running, look at the "stats" overlay on the plan (operator timing)
SELECT
  c.country,
  c.loyalty_tier,
  COUNT(DISTINCT c.customer_id)  AS customers,
  COUNT(o.order_id)              AS total_orders,
  SUM(o.price_usd)               AS revenue,
  AVG(o.price_usd)               AS avg_order_value,
  SUM(o.price_usd) / COUNT(DISTINCT c.customer_id) AS revenue_per_customer
FROM customers c
JOIN orders o    ON c.customer_id = o.customer_id
JOIN movies m    ON o.movie_id    = m.movie_id
WHERE o.status   = 'completed'
  AND m.genre    IN ('Action', 'Thriller', 'Drama')
  AND o.order_date >= '2020-01-01'
GROUP BY c.country, c.loyalty_tier
HAVING COUNT(o.order_id) >= 5
ORDER BY revenue DESC`,
    challenge: 'Run the query. After the results load, click back to the Execution Plan tab — the plan now shows actual row counts and per-operator timing (look at the amber time badges). Find the slowest operator. Then try to optimise: can you add a more selective WHERE clause to reduce the rows the join processes? Compare the before/after timing.',
    hints: [
      'Post-execution plan shows timing in amber on each operator card.',
      'The bottleneck is usually the operator with the most rows × most time.',
      'Try narrowing: AND c.country = \'United States\' AND c.loyalty_tier = \'Gold\'',
    ],
    keyOperators: ['HASH_JOIN', 'HASH_GROUP_BY', 'FILTER', 'ORDER_BY'],
    concepts: ['EXPLAIN ANALYZE', 'Cardinality estimation error', 'Bottleneck identification', 'N+1 pattern'],
    next: null,
  },
];

export const LESSON_MAP = Object.fromEntries(LESSONS.map(l => [l.id, l]));
