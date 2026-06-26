# 012 - match on Result

Every match on Result<T,E> must handle both Ok and Err. Missing arms emit SPORE-MATCH-001.
